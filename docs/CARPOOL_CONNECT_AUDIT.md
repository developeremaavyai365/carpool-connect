# Carpool Connect — Application Audit

**Date:** June 11, 2026  
**Primary stack:** `frontend/` (Vite + React) + `backend/` (Express)  
**Database:** Supabase Postgres (`rejqxwtyisasykblbvyy`) or local SQLite (dev fallback)

---

## Existing Pages

| Route | File | Auth |
|-------|------|------|
| `/login` | `frontend/src/pages/Login.jsx` | Public |
| `/register` | `frontend/src/pages/Register.jsx` | Public |
| `/forgot-password` | `frontend/src/pages/ForgotPassword.jsx` | Public |
| `/dashboard` | `frontend/src/pages/Dashboard.jsx` | Required |
| `/publish` | `frontend/src/pages/Publish.jsx` | Required |
| `/commutes` | `frontend/src/pages/BrowseCommutes.jsx` | Required |
| `/rides` | `frontend/src/pages/YourRides.jsx` | Required |
| `/live-location` | `frontend/src/pages/LiveLocation.jsx` | Required |
| `/profile` | `frontend/src/pages/Profile.jsx` | Required |
| `/requests` | `frontend/src/pages/Requests.jsx` | Required |
| `/notifications` | `frontend/src/pages/Notifications.jsx` | Required |

---

## Existing Components

**Layout & UI:** `Layout`, `Avatar`, `ThemeToggle`, `ToastContainer`, `NotificationBell`, `NotificationBridge`, `OtpInput`, `SearchCard`

**Maps & commute:** `LocationPicker`, `MapPickerModal`, `RoutePlanner`, `RouteLocationField`, `PublishRouteMap`, `LiveMap`, `CommuteCard`, `CommuteDetailModal`

**Context:** `AuthContext`, `LocationContext`, `ThemeContext`, `ToastContext`

**Hooks:** `useAutofillSync`, `useRouteLocations`, `useLiveLocation`, `useRideRealtime`, `useGeospatialRidesRealtime`

---

## Existing API Routes

**Base:** Express on port 3001 (`backend/src/server.js`)

| Prefix | File | Key endpoints |
|--------|------|---------------|
| `/api/auth` | `routes/auth.js` | OTP, register, login, reset-password, me |
| `/api/employees` | `routes/employees.js` | profile, search, recommendations, cities |
| `/api/commutes` | `routes/commutes.js` | search, CRUD, routes |
| `/api/requests` | `routes/requests.js` | carpool requests |
| `/api/notifications` | `routes/notifications.js` | inbox, unread, broadcast |
| `/api/location` | `routes/location.js` | geocode, reverse, nearby |
| `/api/rides` | `modules/rides/` | PostGIS search, publish, book |
| `/api/health` | `server.js` | health check |

**Realtime:** Supabase Realtime (production) or Socket.io (SQLite dev)

---

## Existing Services

**Backend:** `supabaseAuth.js`, `emailQueue.js`, `liveLocations.js`, `rideRealtime.js`, `database.js` / `supabaseStore.js`

**Geospatial module:** `matching.service.ts`, `ranking.service.ts`, `trip.service.ts`, `route.service.ts`, `cache.service.ts`, `realtime.service.ts`

**Frontend:** `api.js`, `realtime.js`, `socket.js`, `notifications.js`

---

## Existing Database Tables

### Core (migration 001)
`users`, `user_details`, `published_commutes`, `carpool_requests`, `notifications`, `email_queue`, `notification_feedback`, `otps`, `verification_tokens`, `live_locations`

### Geospatial (migration 003)
`driver_profiles`, `trips` (PostGIS LINESTRING, links to `published_commutes.commute_id`), `bookings`, `book_trip_seats()`

### Deprecated parallel schema (migration 004 — do not use)
UUID `rides`, NestJS-only tables — superseded by Carpool Connect `trips` + `published_commutes`

---

## Existing Supabase Resources

- **Auth:** email/password, OTP via `supabaseAuth.js`
- **Realtime publications:** `published_commutes`, `carpool_requests`, `notifications`, `live_locations`, `trips`, `bookings`
- **RLS:** enabled on core tables; `current_app_user_id()` helper
- **PostGIS:** `CREATE EXTENSION postgis`; GIST index on `trips.route_geometry`

---

## Existing Authentication System

1. **Register:** email OTP → verify → `users` row + Supabase Auth user
2. **Login:** Supabase Auth or local bcrypt JWT
3. **Session:** Bearer token in `localStorage`; restored via `GET /api/auth/me`
4. **Roles:** `employee`, `owner` (admin notifications)
5. **Password reset:** OTP email flow

---

## Dependency Map

```
frontend (React)
  ├── AuthContext → /api/auth/*
  ├── commuteApi → /api/commutes/*  → published_commutes
  ├── ridesApi → /api/rides/*       → trips (PostGIS)
  ├── requestApi → /api/requests/*  → carpool_requests
  └── realtime.js → Supabase channels

backend (Express)
  ├── database.js → supabaseStore | sqlite
  ├── commutes.js → published_commutes + syncGeospatialTripFromCommute → trips
  └── modules/rides → pg direct → trips, bookings
```

---

## Single Application Policy

All development occurs in `frontend/` + `backend/`. No parallel frontend, backend, or duplicate ride tables.
