# Carpool Connect — Platform Guide

**Carpool Connect** is the only application in this repository.

## Stack

| Layer | Path | Port |
|-------|------|------|
| Frontend | `frontend/` (Vite + React) | 5173 (dev) |
| Backend | `backend/` (Express) | 3001 |
| Database | Supabase Postgres + PostGIS | — |
| Realtime | Supabase Realtime | — |
| Cache | Redis (optional) | 6379 |

## Quick start

```bash
# Terminal 1 — API
cd backend && npm install && npm run dev

# Terminal 2 — Frontend (dev)
cd frontend && npm install && npm run dev
```

Production (serves built frontend from Express):

```bash
npm start
```

## Ride system (single source of truth)

| Table | Purpose |
|-------|---------|
| `published_commutes` | Primary listing (route text, seats, preferences) |
| `trips` | PostGIS geometry linked via `commute_id` |
| `bookings` | Geospatial seat bookings on `trips` |
| `carpool_requests` | Request/accept flow between users |

**Publish flow:** `POST /api/commutes` creates `published_commutes`, then automatically syncs a PostGIS `trips` row with route polyline and LINESTRING geometry.

**Search flow:** `BrowseCommutes` geocodes pickup/drop → `GET /api/rides/search` for corridor matching (Gurgaon→Neemrana on Delhi→Jaipur). Falls back to text search on `published_commutes`.

## Geospatial API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rides/search` | PostGIS corridor + stopover verify + ranking |
| POST | `/api/rides/book` | Atomic seat booking |
| POST | `/api/rides` | Direct trip publish (advanced) |

## Supabase

```bash
npm run supabase:link
npm run supabase:db:push
```

Migrations: `supabase/migrations/001` (core), `003` (PostGIS trips). Migration `004` is deprecated.

## Docker

```bash
docker compose up --build
```

Serves Carpool Connect on port 3001 with optional Redis.

## Docs

- [Audit](./CARPOOL_CONNECT_AUDIT.md)
- [Consolidation report](./CONSOLIDATION_REPORT.md)
- [Geospatial rides](./GEOSPATIAL_RIDES.md)
