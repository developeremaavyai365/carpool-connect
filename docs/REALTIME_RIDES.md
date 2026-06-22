# Supabase Realtime — Ride Publishing

This document describes how live ride publishing works in CarPool Connect.

## Overview

When a driver publishes a ride, other users browsing **Browse rides** (`/commutes`) see the new listing **without refreshing the page**.

| Layer | Role |
|-------|------|
| **Database** | `published_commutes` table (rides) |
| **Supabase Realtime** | Broadcasts INSERT events + custom `new_ride` broadcast |
| **Backend** | Listens for INSERT, enriches ride, emits to all clients |
| **Frontend** | Subscribes to Realtime, updates browse list + toast |

## Database

Table: `public.published_commutes`

Migration `002_rides_realtime.sql`:
- Adds table to `supabase_realtime` publication
- Sets `REPLICA IDENTITY FULL` for complete change payloads

Apply:

```powershell
npm run supabase:db:push
```

Or run `supabase/migrations/002_rides_realtime.sql` in Supabase SQL Editor.

## Backend

### Files

| File | Purpose |
|------|---------|
| `backend/src/services/rideRealtime.js` | INSERT listener + broadcast |
| `backend/src/routes/commutes.js` | Calls `publishRideCreated()` after POST |
| `backend/src/server.js` | Starts listener on boot when Supabase is active |

### Flow

1. Driver calls `POST /api/commutes`
2. Row inserted into `published_commutes`
3. **Immediate:** `publishRideCreated()` broadcasts enriched ride on channel `rides-public` event `new_ride`
4. **Listener:** Backend postgres_changes INSERT handler also broadcasts (covers direct DB inserts)

### SQLite fallback

When Supabase is not configured, `publishRideCreated()` emits Socket.io event `ride:published`.

## Frontend

### Files

| File | Purpose |
|------|---------|
| `frontend/src/services/realtime.js` | Supabase broadcast + postgres INSERT subscriptions |
| `frontend/src/hooks/useRideRealtime.js` | React hook for browse pages |
| `frontend/src/utils/commuteFilters.js` | Filter matching for live rides |
| `frontend/src/pages/BrowseCommutes.jsx` | Prepends new rides + toast + “Live update” badge |

### Subscriptions (Supabase mode)

1. **Broadcast** — channel `rides-public`, event `new_ride` (enriched payload from backend)
2. **Postgres** — INSERT on `published_commutes` (backup; fetches full ride via API if needed)

Deduping prevents duplicate cards when both fire (15s window).

## Testing

### Automated

```powershell
cd backend
node scripts/test-ride-realtime.js
```

Creates a test ride, broadcasts it, then removes it.

### Manual (two clients)

1. Open **Browse rides** on two browsers/phones (logged in as different users)
2. On a third session (or same network), **Publish commute**
3. Both browse screens should show the new ride instantly with a toast

### Health check

```powershell
curl http://127.0.0.1:3001/api/health
```

Expect: `"rideRealtime": "supabase"` when configured.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No live updates | Run migration `002_rides_realtime.sql` |
| Only publisher sees ride | Check user is on Browse rides while logged in |
| Duplicate cards | Should auto-dedupe; refresh if stuck |
| SQLite dev mode | Uses Socket.io `ride:published` instead |

## Challenges

1. **Supabase SMTP timeouts** — unrelated to ride realtime; auth emails use Gmail fallback
2. **Raw postgres payload** lacks `driver_name` — backend enriches before broadcast; frontend fetches via API as backup
3. **RLS** — authenticated users can SELECT active commutes; Realtime respects RLS for postgres subscriptions
4. **Tunnel URL changes** — does not affect Realtime (uses Supabase project URL from env)
