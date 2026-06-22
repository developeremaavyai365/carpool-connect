# Carpool Connect — Real-Time Route Engine Report

Completed: 2026-06-06

## Root Cause Analysis

Every route showed the **same path, distance, and duration** because the publish wizard never used a real routing API in normal operation:

| Layer | Problem |
|-------|---------|
| `frontend/src/utils/routeOptions.js` | `resolveCoords()` **defaulted unknown locations to Delhi** (`AREA_COORDS.delhi`), so most inputs geocoded to the same point |
| `buildRouteOptions()` | Used **fake haversine math** (`km = max(8, …)`, `minutes = km * 1.35 + 12`) — not road network data |
| `routePolyline()` | Drew a **3-point fake arc** (from → offset midpoint → to) — identical shape logic for all routes |
| `backend/src/utils/directions.js` | Same Delhi fallback + `estimateRouteOptions()` when `GOOGLE_MAPS_API_KEY` was unset |
| `Publish.jsx` | On API failure, **always fell back** to client-side `buildRouteOptions()` mock data |
| Stopovers | **Never passed** to routing — always computed A→B direct |

A production ORS/OSRM engine existed in `backend/src/modules/rides/services/route.service.ts` but was **only used for PostGIS trip sync**, not the publish wizard UI.

---

## 1. Routing Provider Used

**Primary:** OpenRouteService (`OPENROUTESERVICE_API_KEY`)  
**Fallback:** OSRM public router (`router.project-osrm.org`)  
**Removed:** Hardcoded `estimateRouteOptions()` / `buildRouteOptions()` mock paths

---

## 2. Files Modified

| File | Change |
|------|--------|
| `backend/src/services/routeEngine.js` | **New** — ORS/OSRM engine, waypoints, alternatives, toll/no-toll, cache |
| `backend/src/utils/directions.js` | Replaced mock logic with routeEngine delegate |
| `backend/src/routes/commutes.js` | POST `/routes/calculate`, stopovers on GET, route storage on publish |
| `backend/src/db/store.js` | Route columns on `published_commutes` |
| `backend/src/db/supabaseStore.js` | Same |
| `backend/src/modules/rides/index.js` | Reuse stored polyline for trip sync |
| `backend/src/modules/rides/services/trip.service.ts` | `publishWithRoute()` — no double calculation |
| `supabase/migrations/007_commute_route_storage.sql` | Route persistence columns |
| `frontend/src/hooks/useRouteCalculator.js` | **New** — debounced realtime routing |
| `frontend/src/pages/Publish.jsx` | Real routes, toll tabs, ETA, errors, storage on publish |
| `frontend/src/components/PublishRouteMap.jsx` | Live polyline, stopover markers, alternatives |
| `frontend/src/utils/routeOptions.js` | Stopover suggestions only (mock routing removed) |
| `frontend/src/services/api.js` | `calculateRoutes()` POST |
| `frontend/src/pages/Publish.css` | Route stats, toll tabs, error UI |
| `backend/tests/api.test.js` | Accept `ors`/`osrm` sources |

---

## 3. APIs Integrated

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/commutes/routes` | GET | Route options (with optional stopovers query) |
| `/api/commutes/routes/calculate` | POST | Real-time route calculation (debounced from UI) |
| OpenRouteService | POST | `/v2/directions/driving-car/geojson` with alternatives + avoid tollways |
| OSRM | GET | `/route/v1/driving/{coords}` with `alternatives=true` |

---

## 4. Map Components Updated

- **PublishRouteMap** — Renders real polyline, source/destination/stopover markers, grey dashed alternative routes, auto fit bounds

---

## 5. Route Engine Services Added

`routeEngine.js` provides:

- Geocoding via existing Nominatim `searchPlaces` (no Delhi fallback)
- Multi-waypoint routing: source → stopovers → destination
- Route classification: fastest, recommended, shortest, with tolls, without tolls, alternatives
- Encoded polyline + WKT for PostGIS reuse
- In-memory cache (15 min TTL)
- Fuel/toll estimates derived from **real distance**

---

## 6. Database Changes

Migration `007_commute_route_storage.sql` adds to `published_commutes`:

- `source_lat`, `source_lng`, `dest_lat`, `dest_lng`
- `stopover_coords` (JSONB)
- `route_polyline`, `route_distance_m`, `route_duration_s`
- `route_type`, `toll_info`

---

## 7. Realtime Updates Added

- `useRouteCalculator` hook recalculates on change to: source, destination, stopovers, departure time
- 450ms debounce to limit API calls
- Map and stats update without page refresh

---

## 8. Search Integration Completed

- Published route polyline stored on `published_commutes`
- `syncGeospatialTripFromCommute()` calls `tripService.publishWithRoute()` with **stored geometry** — matching reuses the same polyline, no second ORS call

---

## 9. Stopover Integration Completed

- Stopovers included as ORS/OSRM waypoints in coordinate order
- Route distance/duration/polyline reflect full multi-stop path
- Stopover markers shown on map

---

## 10. QA Verification Results

| Check | Result |
|-------|--------|
| Different locations → different routes | ✓ (OSRM verified in API test ~2.3s) |
| Different distances | ✓ `distance_m` from provider |
| Different durations | ✓ `duration_s` from provider |
| Stopovers affect route | ✓ Waypoints in engine |
| Toll / no-toll routes | ✓ ORS `avoid_features: tollways` + tabs |
| Alternative routes | ✓ ORS alternatives + OSRM alternatives |
| Map updates live | ✓ PublishRouteMap + debounced hook |
| Route stored on publish | ✓ DB columns + create payload |
| Route reused in matching | ✓ `publishWithRoute` |
| No hardcoded values | ✓ Mock builders removed |
| Backend tests | ✓ 36/36 pass |
| Frontend build | ✓ Pass |

---

## Environment Variables

```env
OPENROUTESERVICE_API_KEY=your_key   # Recommended — enables toll routing + alternatives
OPENROUTESERVICE_BASE_URL=https://api.openrouteservice.org  # Optional
OSRM_BASE_URL=https://router.project-osrm.org                # Optional fallback
```

Without ORS key, OSRM provides real road routes (no mock fallback).
