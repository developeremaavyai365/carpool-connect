# Supabase Realtime — Ride Publishing Implementation Report

**Project:** CarPool Connect  
**Date:** June 6, 2026  
**Feature:** Live ride publishing via Supabase Realtime  
**Database table:** `published_commutes` (UI label: rides / commutes)

---

## Executive Summary

Ride publishing now supports **instant, multi-client updates** without page refresh. When a driver publishes a ride, all connected users on **Browse rides** receive the new listing within seconds through Supabase Realtime broadcast and postgres change subscriptions.

The implementation uses a **dual-path delivery model**: the backend broadcasts enriched ride payloads immediately after API creation, and a backend INSERT listener rebroadcasts for any direct database inserts. The frontend deduplicates events and merges matching rides into the browse list with a toast notification.

---

## Requirements Mapping

| # | Requirement | Status | Implementation |
|---|-------------|--------|----------------|
| 1 | Backend Supabase Realtime for ride publishing | Done | `backend/src/services/rideRealtime.js` |
| 2 | Backend event listener for new ride insertions | Done | `startRideInsertListener()` on `published_commutes` INSERT |
| 3 | Emit realtime event to all connected clients | Done | Broadcast channel `rides-public`, event `new_ride` |
| 4 | Frontend listener for backend events | Done | `frontend/src/services/realtime.js` |
| 5 | Update UI without refresh | Done | `BrowseCommutes.jsx` + `useRideRealtime` hook |
| 6 | Frontend/backend connected via Supabase Realtime | Done | Shared channel name + Supabase project URL |
| 7 | Test by inserting ride | Done | `backend/scripts/test-ride-realtime.js` |
| 8 | Adjustments for smooth operation | Done | Deduping, enrichment, filter matching |
| 9 | Documentation | Done | `docs/REALTIME_RIDES.md` |
| 10 | Detailed report | Done | This document |

---

## Architecture

```
Driver → POST /api/commutes
           │
           ├─► INSERT published_commutes (Supabase Postgres)
           │
           ├─► publishRideCreated() ──► broadcastNewRide()
           │         │
           │         └─► Supabase channel "rides-public" event "new_ride"
           │
           └─► (async) postgres_changes INSERT listener
                     │
                     └─► findCommuteById() enrich ──► broadcastNewRide()

All connected clients (Browse rides):
  ├─ Subscribe: broadcast "new_ride" on "rides-public"
  ├─ Subscribe: postgres INSERT on published_commutes (backup)
  ├─ Filter via commuteMatchesBrowseFilters()
  └─ Prepend to list + toast "New ride published"
```

### Why dual delivery?

1. **API broadcast** — lowest latency; enriched payload includes `driver_name`, city, etc.
2. **DB listener** — catches rides inserted outside the API (admin SQL, migrations, scripts).
3. **Frontend postgres subscription** — backup if broadcast channel misses an event; fetches full ride via API when raw row lacks driver details.

### Deduping

Both broadcast and postgres INSERT can fire for the same ride. A 15-second in-memory dedupe map (`recentRideIds`) prevents duplicate cards.

---

## Backend Changes

### New: `backend/src/services/rideRealtime.js`

- **`broadcastNewRide(commute)`** — Subscribes admin client to `rides-public` and sends `{ type: 'broadcast', event: 'new_ride', payload: commute }`.
- **`startRideInsertListener()`** — Listens for `INSERT` on `public.published_commutes`; loads full commute via `db.findCommuteById()` and broadcasts.
- **`publishRideCreated(commute, { app })`** — Called from commute POST route; uses Supabase broadcast or Socket.io `ride:published` for SQLite dev mode.
- **`stopRideInsertListener()`** — Cleanup on server shutdown.

### Modified: `backend/src/server.js`

- Calls `startRideInsertListener()` when Supabase is configured at startup.
- Health endpoint reports `rideRealtime: "supabase" | "off"`.

### Modified: `backend/src/routes/commutes.js`

- After successful `POST /api/commutes`, calls `await publishRideCreated(commute, { app: req.app })`.

### Database: `supabase/migrations/002_rides_realtime.sql`

```sql
ALTER TABLE public.published_commutes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.published_commutes;
```

`REPLICA IDENTITY FULL` ensures Realtime payloads include all column values on INSERT/UPDATE.

---

## Frontend Changes

### Modified: `frontend/src/services/realtime.js`

- **`onNewRidePublished(callback)`** — Register/unregister ride listeners (persist across reconnect).
- **Supabase subscriptions:**
  - Broadcast: channel `rides-public`, event `new_ride`
  - Postgres: INSERT on `published_commutes` with API enrichment fallback
- **Socket.io fallback:** `ride:published` when Supabase is not configured.

### New: `frontend/src/hooks/useRideRealtime.js`

React hook wrapping `onNewRidePublished` with browse filter refs (`routeFrom`, `routeTo`, `date`, `city`, `userId`).

### New: `frontend/src/utils/commuteFilters.js`

`commuteMatchesBrowseFilters()` — mirrors server-side search logic for live inserts (excludes own rides, past departures, city/route/date filters).

### Modified: `frontend/src/pages/BrowseCommutes.jsx`

- Uses `useRideRealtime` to prepend new rides, sort by departure, show toast, flash "Live update" badge.
- Dedupes by ride id in state.

### Modified: `frontend/src/pages/BrowseCommutes.css`

- Styles for `.browse-live-badge`.

---

## Testing

### Automated script

```powershell
cd backend
node scripts/test-ride-realtime.js
```

Creates a test commute, broadcasts it, verifies broadcast success, deletes test row.

### Manual verification (recommended)

1. Apply migration: `npm run supabase:db:push`
2. Restart server: `npm run fix:tunnel` (or `start:public:bg`)
3. Open **Browse rides** on two devices/browsers (different users)
4. Publish a ride from a third session
5. Confirm both browse screens update instantly with toast

### Health check

```powershell
curl http://127.0.0.1:3001/api/health
```

Expect `"rideRealtime": "supabase"` when configured.

---

## Challenges and Resolutions

### 1. Table naming vs. user terminology

The app stores rides in `published_commutes`, not `rides`. All Realtime subscriptions target the correct table name.

### 2. Raw postgres payload lacks joined fields

INSERT events only contain table columns — no `driver_name`. **Resolution:** Backend enriches via `findCommuteById()` before broadcast; frontend calls `commuteApi.getById()` as backup.

### 3. Duplicate events

Broadcast + postgres INSERT both fire for API-created rides. **Resolution:** 15-second client-side dedupe by ride id.

### 4. RLS and Realtime

Postgres change subscriptions respect Row Level Security. Authenticated users with SELECT on active commutes receive INSERT events. Broadcast channel uses public channel name; payload is the enriched commute object (same data visible in browse search).

### 5. SQLite development mode

Without Supabase, Realtime uses existing Socket.io infrastructure with `ride:published` event from `publishRideCreated()`.

### 6. Cloudflare tunnel URL changes

Tunnel URL affects auth redirects only. Realtime connects to Supabase project URL from `VITE_SUPABASE_URL` — unaffected by tunnel restarts.

### 7. Supabase Auth SMTP timeouts (separate issue)

Auth OTP emails may timeout (504); Gmail fallback exists. Does not block ride Realtime.

---

## Operational Notes

- **Migration required:** Run `002_rides_realtime.sql` before expecting live updates in production.
- **Backend must be running** for INSERT listener rebroadcast (direct SQL inserts). API publishes also broadcast directly from route handler.
- **Users must be logged in** and on Browse rides with Realtime connected (`connectRealtime` in AuthContext).

---

## Files Changed (Summary)

| Path | Change |
|------|--------|
| `supabase/migrations/002_rides_realtime.sql` | New — enable Realtime on table |
| `supabase/migrations/001_initial_schema.sql` | Updated — idempotent publication add |
| `backend/src/services/rideRealtime.js` | New — core Realtime service |
| `backend/src/server.js` | Start listener on boot |
| `backend/src/routes/commutes.js` | Broadcast after create |
| `backend/scripts/test-ride-realtime.js` | New — test script |
| `frontend/src/services/realtime.js` | Ride subscriptions |
| `frontend/src/hooks/useRideRealtime.js` | New — React hook |
| `frontend/src/utils/commuteFilters.js` | New — filter helper |
| `frontend/src/pages/BrowseCommutes.jsx` | Live UI updates |
| `frontend/src/pages/BrowseCommutes.css` | Live badge styling |
| `docs/REALTIME_RIDES.md` | Developer documentation |
| `docs/REALTIME_IMPLEMENTATION_REPORT.md` | This report |

---

## Future Enhancements (optional)

- Live updates on Dashboard "My area" widget
- Realtime for ride cancellation (UPDATE/DELETE events)
- Server-side filter on broadcast to reduce client traffic in large deployments
