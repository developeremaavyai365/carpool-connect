require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// ── Startup env validation ────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret || jwtSecret.includes('dev-secret') || jwtSecret.length < 32) {
    console.error('[FATAL] JWT_SECRET is weak or missing. Set a strong random secret in production.');
    process.exit(1);
  }
  if (process.env.OTP_DEV_MODE === 'true') {
    console.error('[FATAL] OTP_DEV_MODE=true must not be set in production — OTP codes would leak in API responses.');
    process.exit(1);
  }
}

const db = require('./database');
const { isSupabaseConfigured } = require('./lib/supabase');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const { router: requestRoutes } = require('./routes/requests');
const notificationRoutes = require('./routes/notifications');
const commuteRoutes = require('./routes/commutes');
const locationRoutes = require('./routes/location');
const platformRoutes = require('./routes/platform');
const { ensureDemoUsers, ensureOwnerUser, demoteGmailSenderFromOwnerRole } = require('./seed');
const { isEmailConfigured, verifyEmailConnection } = require('./utils/mailer');
const { getAccessInfo } = require('./utils/appUrl');
const { corsOptions } = require('./config/cors');
const {
  setLocation, removeLocation, countNearby, listActive, getLocation, isSupabaseBacked,
} = require('./services/liveLocations');
const { startEmailQueueProcessor } = require('./services/emailQueue');
const { startRideInsertListener, stopRideInsertListener } = require('./services/rideRealtime');

const useSupabase = isSupabaseConfigured();

if (!process.env.SKIP_DEMO_SEED) {
  Promise.all([
    ensureDemoUsers(),
    demoteGmailSenderFromOwnerRole(),
    ensureOwnerUser(),
  ]).catch((err) => console.warn('[Seed] startup sync failed:', err.message));
}

const app = express();
const server = http.createServer(app);

if (isProduction || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: isProduction ? undefined : false,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
});
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests, please wait 10 minutes.' },
});

const corsOpts = corsOptions();

let io = null;
if (!useSupabase) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { ...corsOpts, methods: ['GET', 'POST'] },
  });
}

app.set('io', io);

app.use(cors(corsOpts));
app.use(express.json());

const { loadRidesRouter } = require('./modules/rides');
const ridesRouter = loadRidesRouter();
if (ridesRouter) {
  console.log('[RidesModule] Geospatial matching API mounted at /api/rides');
}

app.get('/api/health', async (_req, res) => {
  const access = getAccessInfo();
  const emailQueue = await db.getEmailQueueStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: isProduction ? 'production' : 'development',
    database: {
      engine: useSupabase ? 'supabase' : 'sqlite',
      path: db.getDbPath(),
    },
    realtime: useSupabase ? 'supabase' : 'socket.io',
    rideRealtime: useSupabase ? 'supabase' : (io ? 'socket.io' : 'none'),
    geospatial: ridesRouter ? 'postgis' : 'unavailable',
    authEmail: useSupabase ? 'supabase' : (isEmailConfigured() ? 'gmail' : 'none'),
    emailQueue,
    access,
    email: {
      authOtp: useSupabase ? 'supabase' : (isEmailConfigured() ? 'gmail' : 'dev'),
      notifications: isEmailConfigured() ? 'gmail' : 'none',
      configured: isEmailConfigured(),
    },
  });
});

app.get('/api/access', (_req, res) => {
  res.json(getAccessInfo());
});

app.use('/api/commutes', commuteRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/platform', platformRoutes);

if (ridesRouter) {
  app.use('/api/rides', ridesRouter);
  app.use('/api/rides', (err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
  });
}

app.use('/api/auth/otp', otpLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/notifications', notificationRoutes);

if (isProduction) {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

function attachSocketHandlers(socketServer) {
  socketServer.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  socketServer.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    db.findEmployeeById(socket.userId).then((employee) => {
      if (employee?.city) {
        socket.join(`city:${employee.city}`);
      }
    }).catch(() => {});

    socket.emit('connected', { userId: socket.userId });

    socket.on('location:update', async (data) => {
      const { lat, lng, accuracy, city, route_from, name } = data || {};
      if (lat == null || lng == null) return;

      const employee = await db.findEmployeeById(socket.userId);
      const resolvedCity = city || employee?.city || null;

      await setLocation(socket.userId, {
        lat,
        lng,
        accuracy,
        city: resolvedCity,
        route_from: route_from || employee?.route_from,
        name: name || employee?.name,
      });

      if (resolvedCity) {
        socket.join(`city:${resolvedCity}`);
      }

      const nearbyCount = await countNearby({
        lat, lng, city: resolvedCity, radiusKm: 15, excludeUserId: socket.userId,
      });
      socket.emit('colleague:activity', { nearbyCount, city: resolvedCity });

      if (resolvedCity) {
        const colleagues = (await listActive({ city: resolvedCity, excludeUserId: socket.userId }))
          .map(({ userId, name: n, lat: la, lng: ln, route_from: rf, accuracy: acc, updatedAt }) => ({
            userId, name: n, lat: la, lng: ln, route_from: rf, accuracy: acc, updatedAt,
          }));

        socket.emit('locations:nearby', { colleagues, city: resolvedCity, nearbyCount });
        socket.to(`city:${resolvedCity}`).emit('locations:update', {
          userId: socket.userId,
          name: name || employee?.name,
          lat,
          lng,
          route_from: route_from || employee?.route_from,
          city: resolvedCity,
          updatedAt: Date.now(),
        });
      }
    });

    socket.on('location:request-nearby', async () => {
      const employee = await db.findEmployeeById(socket.userId);
      const city = employee?.city;
      if (!city) return;

      const self = await getLocation(socket.userId);
      const colleagues = (await listActive({ city, excludeUserId: socket.userId }))
        .map(({ userId, name: n, lat, lng, route_from, accuracy, updatedAt }) => ({
          userId, name: n, lat, lng, route_from, accuracy, updatedAt,
        }));

      const nearbyCount = await countNearby({
        lat: self?.lat,
        lng: self?.lng,
        city,
        radiusKm: 15,
        excludeUserId: socket.userId,
      });

      socket.emit('locations:nearby', { colleagues, city, nearbyCount });
    });

    socket.on('disconnect', () => {
      removeLocation(socket.userId).catch(() => {});
      socket.leave(`user:${socket.userId}`);
    });
  });
}

if (io) {
  attachSocketHandlers(io);
} else {
  console.log('Realtime: Supabase (Socket.io disabled)');
}

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  server.listen(PORT, HOST, () => {
    startEmailQueueProcessor();
    if (useSupabase) {
      startRideInsertListener();
    }
    // Verify Gmail in background so it never blocks startup
    if (isEmailConfigured()) {
      verifyEmailConnection().then((check) => {
        if (check.ok) {
          console.log('Gmail notifications: enabled and verified');
        } else {
          console.warn('Gmail configured but connection failed:', check.reason);
          console.warn('Users will not receive emails until GMAIL_APP_PASSWORD is correct.');
        }
      });
    } else {
      console.warn('Gmail notifications: disabled — set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env');
    }
    const access = getAccessInfo();
    console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Database: ${useSupabase ? 'Supabase Postgres' : 'SQLite'}`);
    if (isProduction) {
      console.log('Serving frontend from /frontend/dist (production mode)');
    } else {
      console.log('Dev mode — also reachable on your local network for mobile testing');
    }
    if (access.publicUrl) {
      console.log(`\n📱 MOBILE (any network): ${access.publicUrl}`);
    } else if (access.lanUrl) {
      console.log(`\n📱 MOBILE (same WiFi only): ${access.lanUrl}`);
      console.log('   For any network, run: npm run start:public:bg');
    }
    console.log('   ⚠️  Never open "localhost" on your phone — it will not work.\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other process or run:`);
      console.error('  npm run dev          (auto-frees the port on Windows)');
      console.error('  start-dev.bat        (same, from the backend folder)');
      process.exit(1);
    }
    console.error('Server failed to start:', err.message);
    process.exit(1);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, startServer, useSupabase, isSupabaseBacked };
