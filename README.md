# CarPool Connect

A full-stack employee carpooling platform for companies across India. Employees can publish commutes, discover rides, book seats, and coordinate routes in real time.

---

## Features

- **Smart ride matching** — PostGIS spatial search with configurable radius; match types: `exact`, `nearby`, `recommended`
- **Publish & book commutes** — 7-step wizard to publish a route; passengers search by GPS coordinates and book seats
- **Real-time notifications** — Socket.io (dev) + Supabase Realtime (production); live unread counts and toast alerts
- **OTP authentication** — Email or phone OTP login; password reset flow; Supabase Auth support
- **Live location** — Opt-in GPS sharing to see colleagues nearby on a map
- **Route engine** — Google Maps → OpenRouteService → OSRM fallback chain with 15-minute caching
- **Reviews & ratings** — Post-ride rating system for drivers and passengers
- **Profile completion scoring** — Prompts users to fill in missing details
- **Dark mode** — System-aware theme with manual toggle

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite · React Router 6 |
| Backend | Node.js · Express · TypeScript (rides module) |
| Database | SQLite (`better-sqlite3`) in dev · Supabase Postgres in production |
| Real-time | Socket.io (SQLite) · Supabase Realtime (Postgres) |
| Auth | JWT + bcryptjs · Supabase Auth |
| Geospatial | PostGIS · Google Maps API · OpenRouteService · OSRM |
| Maps (UI) | Leaflet · `@react-google-maps/api` |
| Email | Gmail SMTP · Supabase transactional emails |

---

## Local Setup

### Prerequisites

- Node.js 18+
- npm 9+

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/carpool-connect.git
cd carpool-connect
npm install --prefix backend
npm install --prefix frontend
```

### 2. Configure environment

**Backend** — copy and fill in `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Minimum required for local dev (SQLite mode — no Supabase needed):

```env
PORT=3001
JWT_SECRET=change-me-in-production

# Optional — enables Google Maps autocomplete, directions, geocoding
GOOGLE_MAPS_API_KEY=your_server_side_key
GOOGLE_MAPS_BROWSER_KEY=your_browser_key   # shown in the map picker

# Optional — Gmail SMTP for OTP emails
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
OTP_DEV_MODE=true   # set false once email is configured
```

**Frontend** — create `frontend/.env`:

```env
# Optional — if set, loads Google Maps JS API directly without a backend round-trip
VITE_GOOGLE_MAPS_API_KEY=your_browser_key

# Required for Supabase Realtime (production)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Seed demo data (optional)

```bash
cd backend && npm run seed
```

Demo accounts (password: `demo123`):

| Name | Email |
|---|---|
| Priya Sharma | priya.sharma@company.com |
| Rajesh Kumar | rajesh.kumar@company.com |
| Ananya Reddy | ananya.reddy@company.com |

### 4. Run

```bash
# Terminal 1 — backend (http://localhost:3001)
npm run dev --prefix backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev --prefix frontend
```

---

## Database Modes

| Mode | When | Notes |
|---|---|---|
| **SQLite** | `SUPABASE_URL` not set | Zero config, file stored at `backend/data/app.db` |
| **Supabase Postgres** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set | Enables PostGIS spatial rides, Realtime, Supabase Auth |

The geospatial rides module (`/api/rides`) requires Supabase Postgres + PostGIS.

---

## Deployment

### Frontend → Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. Set **Root Directory** to `frontend`
4. Vercel auto-detects Vite — build command `vite build`, output `dist`
5. Add environment variables in Vercel dashboard:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GOOGLE_MAPS_API_KEY   # optional
VITE_API_URL               # your backend URL e.g. https://carpool-api.onrender.com
```

### Backend → Render

The repo includes `render.yaml` for one-click deploy:

1. Go to [render.com](https://render.com) → **New** → **Blueprint**
2. Connect your GitHub repo — Render reads `render.yaml` automatically
3. Add the following environment variables in the Render dashboard:

```
JWT_SECRET               # generate a strong random string
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
GOOGLE_MAPS_API_KEY      # optional
GMAIL_USER               # optional
GMAIL_APP_PASSWORD       # optional
FRONTEND_URL             # your Vercel URL e.g. https://carpool.vercel.app
```

> **CORS**: Set `FRONTEND_URL` on the backend to your Vercel deployment URL so the API accepts requests from it.

---

## Project Structure

```
carpool-connect/
├── backend/
│   └── src/
│       ├── server.js              # Express + Socket.io entry point
│       ├── database.js            # SQLite / Supabase abstraction
│       ├── routes/                # auth, employees, commutes, requests, notifications, location
│       ├── modules/rides/         # TypeScript geospatial rides module
│       │   ├── services/          # matching, trip, route, payment, review, cache
│       │   ├── repositories/      # PostGIS queries
│       │   └── controllers/
│       ├── services/              # routeEngine, liveLocations, emailQueue
│       └── utils/                 # geocode, mailer, OTP, route matching
├── frontend/
│   └── src/
│       ├── pages/                 # Dashboard, BrowseCommutes, Publish, DriverDashboard, …
│       ├── components/            # SearchCard, CommuteCard, LiveMap, LocationPicker, …
│       ├── context/               # AuthContext, LocationContext, GoogleMapsProvider, …
│       ├── hooks/                 # useRouteLocations, useRouteCalculator, …
│       └── services/              # api.js, realtime.js
├── supabase/
│   └── migrations/               # 10 SQL migrations (schema + PostGIS + RLS)
├── render.yaml                   # Render one-click deploy
└── docker-compose.yml            # Local Docker setup
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/otp/send` | Send OTP to email or phone |
| POST | `/api/auth/otp/verify-login` | Verify OTP, returns JWT |
| POST | `/api/auth/reset-password` | Reset password via OTP |
| GET | `/api/auth/me` | Current user profile |

### Employees
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/employees/profile` | Profile + completion score |
| PUT | `/api/employees/profile` | Update profile |
| GET | `/api/employees/search` | Search by city / route |
| GET | `/api/employees/recommendations` | Route-based recommendations |

### Commutes (Published Rides)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/commutes` | Publish a new commute |
| GET | `/api/commutes/search` | Search published commutes |
| GET | `/api/commutes/mine` | Driver's commutes + stats |
| DELETE | `/api/commutes/:id` | Cancel a commute |

### Rides (Geospatial — requires Supabase)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/rides/search` | Search by GPS coordinates |
| POST | `/api/rides/book` | Book a seat |
| GET | `/api/rides/bookings/mine` | Passenger bookings |
| POST | `/api/rides/reviews` | Submit rating + review |

### Notifications & Location
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | User's notification inbox |
| POST | `/api/location/update` | Update live GPS position |
| GET | `/api/location/nearby` | Nearby colleagues (15 km) |

---

## License

Internal use — Armaan Kaushik.
