# Carpool Connect Consolidation Report

**Date:** June 11, 2026  
**Directive:** Single application — Carpool Connect only

---

## 1. What existed before

| Area | State |
|------|-------|
| **Primary app** | `frontend/` + `backend/` — commutes, requests, auth, notifications, live location |
| **Parallel app** | `apps/web` (Next.js) + `apps/api` (NestJS) — duplicate auth, rides, bookings |
| **Ride data** | `published_commutes` (primary listings) + empty `trips` (PostGIS, not wired to publish) |
| **Search** | Text search on commutes; geospatial search only when coords geocoded in Browse |
| **Publish** | Wrote only to `published_commutes`, no PostGIS geometry |
| **Docs** | `PLATFORM.md` described RideShare as “production path” |

---

## 2. What was added

- **Geospatial sync on publish:** `POST /api/commutes` now creates linked `trips` row with route polyline + LINESTRING geometry via `syncGeospatialTripFromCommute()`
- **Coordinate payload:** Publish wizard sends `source_lat/lng`, `dest_lat/lng` when route is selected
- **Auto-geocode fallback:** Commutes route geocodes from/to labels when coords omitted
- **Trip cancel on commute delete:** `cancelGeospatialTripForCommute()` keeps tables in sync
- **Audit documentation:** `docs/CARPOOL_CONNECT_AUDIT.md`
- **Root Dockerfile:** Single Carpool Connect production image

---

## 3. What was modified

| File | Change |
|------|--------|
| `backend/src/routes/commutes.js` | PostGIS sync on create/delete; coord validation |
| `backend/src/modules/rides/index.js` | Export `syncGeospatialTripFromCommute`, `cancelGeospatialTripForCommute` |
| `backend/src/modules/rides/repositories/trip.repository.ts` | `commute_id` column; `cancelByCommuteId()` |
| `backend/src/modules/rides/types/dto.ts` | `commute_id` on publish DTO |
| `frontend/src/pages/Publish.jsx` | Sends lat/lng with commute payload |
| `package.json` | Removed RideShare scripts; Carpool Connect only |
| `docker-compose.yml` | Backend + Redis (removed NestJS/Next.js services) |
| `docs/PLATFORM.md` | Rewritten for Carpool Connect |

---

## 4. What was merged

Useful RideShare concepts retained **inside Carpool Connect**:

| RideShare feature | Carpool Connect location |
|-------------------|-------------------------|
| PostGIS corridor search | `backend/src/modules/rides/` (already existed) |
| Stopover matching | `matching.service.ts` polyline verify |
| Ranked results | `ranking.service.ts` |
| Atomic booking | `book_trip_seats()` + `/api/rides/book` |
| Supabase Realtime on rides | `useGeospatialRidesRealtime.js` |

No NestJS or Next.js code retained — Express + Vite already had equivalent modules.

---

## 5. Duplicate code removed

| Removed | Reason |
|---------|--------|
| `apps/api/` | Duplicate NestJS backend |
| `apps/web/` | Duplicate Next.js frontend |
| `scripts/sync-platform-env.js` | Copied env to removed apps |
| Root `dev:platform`, `build:platform`, etc. | RideShare-only scripts |

---

## 6. RideShare functionality migrated

| Feature | Migration target |
|---------|------------------|
| PostGIS publish with geometry | `commutes.js` → `syncGeospatialTripFromCommute` |
| Legacy commute search | Already in `/api/commutes/search` |
| Smart route search | Already in BrowseCommutes + `/api/rides/search` |
| Supabase Auth bridge | Already in `backend/src/services/supabaseAuth.js` |

Not migrated (already in Carpool Connect): notifications, requests, profile, live location, OTP auth.

Not migrated (future work in Carpool Connect): payments UI, reviews UI, password reset email templates.

---

## 7. Files changed (this consolidation)

```
backend/src/routes/commutes.js
backend/src/modules/rides/index.js
backend/src/modules/rides/repositories/trip.repository.ts
backend/src/modules/rides/types/dto.ts
frontend/src/pages/Publish.jsx
package.json
docker-compose.yml
Dockerfile (new)
docs/CARPOOL_CONNECT_AUDIT.md (new)
docs/CONSOLIDATION_REPORT.md (new)
docs/PLATFORM.md (rewritten)
```

---

## 8. APIs connected

```
Publish.jsx
  └─ POST /api/commutes
       ├─ published_commutes (primary)
       └─ syncGeospatialTripFromCommute → trips (PostGIS)

BrowseCommutes.jsx
  ├─ GET /api/commutes/search (text)
  └─ GET /api/rides/search (geospatial when coords available)
```

---

## 9. Database tables updated

| Table | Update |
|-------|--------|
| `published_commutes` | Unchanged — primary listing |
| `trips` | Now populated on every commute publish (via `commute_id` FK) |
| `bookings` | Used by `/api/rides/book` |
| Migration 004 tables | **Deprecated** — do not use for new features |

---

## 10. Realtime events

Existing Carpool Connect events (unchanged):

- `published_commutes` INSERT → ride created toast
- `carpool_requests` → request notifications
- `notifications` → inbox updates
- `trips` / `bookings` → geospatial realtime via `useGeospatialRidesRealtime`

---

## Final state

**One unified application: Carpool Connect**

- Frontend: `frontend/`
- Backend: `backend/`
- Database: Supabase (`published_commutes` + `trips` + PostGIS)
- No parallel RideShare stack
- No legacy/replacement labeling
