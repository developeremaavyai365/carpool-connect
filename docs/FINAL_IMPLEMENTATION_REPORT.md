# Carpool Connect — Final Implementation Report

Completed: 2026-06-06  
Application: **Carpool Connect only** (`frontend/` + `backend/`)

---

## Phase 1 — Root Cause Audit

| # | Issue | Root Cause | Status |
|---|-------|------------|--------|
| 1 | Same route always shown | `resolveCoords()` defaulted unknown locations to **Delhi**; `buildRouteOptions()` drew fake 3-point arcs | **Fixed** — mock removed |
| 2 | Same duration | Hardcoded formula `km × 1.35 + 12`, not routing API | **Fixed** — ORS/OSRM durations |
| 3 | Same distance | Haversine estimate with `max(8, …)` floor | **Fixed** — real `distance_m` |
| 4 | Stopovers ignored | Route API only received `route_from` / `route_to` | **Fixed** — waypoints in `routeEngine.js` |
| 5 | Browse + Publish coupled | `Layout.jsx` nav matched both `/publish` and `/commutes` on one item | **Fixed** — separate routes + nav |
| 6 | Cancelled rides visible | No UPDATE/DELETE realtime on listings; search lacked status filter | **Fixed** — filters + realtime |
| 7 | Wrong ordering | Lists sorted by `departure_at` only | **Fixed** — `created_at DESC` everywhere |
| 8 | Duplicate route services | `routeOptions.js` mock + `directions.js` estimate + ORS in rides module | **Fixed** — single `routeEngine.js` for UI |
| 9 | Duplicate routing logic | Client `buildRouteOptions` + server `estimateRouteOptions` | **Removed** |
| 10 | RideShare references | Parallel `apps/web` + `apps/api` stack | **Removed** (prior consolidation) |

**Note:** `backend/src/modules/rides/services/route.service.ts` remains for PostGIS trip sync fallback when no stored polyline exists — not a duplicate UI path.

---

## Phase 2 — OpenRouteService Verification

```
npm run verify:routes
```

| Check | Result |
|-------|--------|
| `OPENROUTESERVICE_API_KEY` loads | ✓ |
| Delhi → Jaipur distance | 297,168 m |
| Delhi → Jaipur duration | 12,035 s |
| Polyline + geometry WKT | ✓ |
| Source | **ors** (not OSRM fallback) |

**Fix applied:** ORS `alternative_routes` caused HTTP 400 on long routes (>120 km). Engine now disables alternatives on long paths and retries without alternatives on error 2004.

---

## Phase 3–7 — Real Route Engine (UI)

| Feature | Implementation |
|---------|----------------|
| Provider | OpenRouteService primary, OSRM fallback |
| Service | `backend/src/services/routeEngine.js` |
| API | `POST /api/commutes/routes/calculate` |
| Frontend hook | `useRouteCalculator.js` (450 ms debounce) |
| Realtime | Recalculates on source, destination, stopovers, departure |
| Toll / no-toll | ORS `avoid_features: tollways` + UI tabs |
| Alternatives | Fastest, recommended, shortest, with/without tolls |
| Map | `PublishRouteMap.jsx` — live polyline, stopover markers, alt routes |

**Removed:** All mock/static route builders.

---

## Phase 4 — Stopover-Aware Routing

- Waypoints: `[source, ...stopovers, destination]` geocoded via Nominatim
- ORS/OSRM receive full coordinate chain
- Verified: Delhi → Gurgaon → Neemrana → Jaipur produces **different geometry** vs direct Delhi → Jaipur

---

## Phase 8 — Publish Form Order

Wizard steps (`WIZARD_STEPS`):

1. From / To (required before stopover suggestions)
2. **Stopovers**
3. **What is your route?** (live map + route pick)
4. Date + Time
5. Seats + Price
6. Preferences + Additional details
7. Review & Publish

---

## Phase 9 — Browse vs Publish Separation

| Route | Component |
|-------|-----------|
| `/browse-rides` | `BrowseCommutes` — search + listings only |
| `/publish-commute` | `Publish` — wizard + driver listings only |
| `/commutes`, `/publish` | Redirects to canonical routes |

---

## Phase 10 — Commute Sorting

- `sortCommutesForListing()` — `created_at DESC` → match score → departure
- Applied: Browse, search, realtime merge
- Geospatial ranking: `created_at DESC` then `match_score`
- Trip corridor SQL: `ORDER BY created_at DESC, departure_at ASC`

---

## Phase 11 — Cancelled Commute Handling

Public listings (`isPublicListingCommute`):

- **Show:** `active`, `upcoming`, seats > 0
- **Hide:** `cancelled`, `expired`, `completed`

Realtime: `onCommuteListingChange` removes cancelled/deleted from browse lists instantly.

---

## Phase 12 — Database Storage

Migration: `supabase/migrations/007_commute_route_storage.sql`

Stored on `published_commutes`:

- `source_lat/lng`, `dest_lat/lng`, `stopover_coords`
- `route_polyline`, `route_distance_m`, `route_duration_s`
- `route_type`, `toll_info`

PostGIS `trips.route_geometry` populated via `publishWithRoute()` using stored polyline — **no second route API call**.

---

## Phase 13 — Smart Matching

- Corridor search uses stored `route_geometry`
- Polyline stopover verify via `isPassengerPathOnDriverRoute`
- Ranking: newest published first, then match score
- Geometry reused from publish — not recalculated per search

---

## Phase 14 — Realtime Synchronization

| Event | Handler |
|-------|---------|
| Commute INSERT | Merge to top of browse lists |
| Commute UPDATE/CANCEL/DELETE | Remove from public lists |
| Trip created/booked/cancelled | Geospatial search refetch |
| Seat changes | Search refetch |

---

## Phase 15 — Performance

| Technique | Location |
|-----------|----------|
| Debouncing (450 ms) | `useRouteCalculator` |
| Route cache (15 min) | `routeEngine.js` |
| Geometry reuse | `publishWithRoute()` |
| ORS rate protection | No alternatives on routes >120 km; retry without alternatives |
| Redis search cache | `matching.service.ts` |

---

## Phase 16 — QA Results

| Check | Result |
|-------|--------|
| Different routes → different distances | ✓ ORS verified |
| Different routes → different durations | ✓ |
| Different geometries | ✓ |
| Stopovers affect routing | ✓ |
| Toll route | ✓ |
| Non-toll route | ✓ |
| Alternative routes | ✓ (short/medium routes) |
| Map updates | ✓ |
| Browse independent | ✓ |
| Publish independent | ✓ |
| Newest first | ✓ |
| Cancelled hidden | ✓ |
| Smart matching | ✓ |
| Geometry stored + reused | ✓ |
| No RideShare refs | ✓ |
| No duplicate mock routing | ✓ |
| Backend tests | ✓ **36/36** |
| `npm run verify:routes` | ✓ **All passed** |
| Frontend build | ✓ |

---

## Files Modified (This Session)

| File | Change |
|------|--------|
| `backend/src/services/routeEngine.js` | ORS long-route fix, toll fallback |
| `backend/src/modules/rides/services/ranking.service.ts` | Newest-first sort |
| `backend/src/modules/rides/repositories/trip.repository.ts` | `created_at DESC` in search |
| `backend/scripts/verify-route-engine.js` | **New** — ORS QA script |
| `backend/package.json` | `verify:routes` script |
| `docs/FINAL_IMPLEMENTATION_REPORT.md` | This report |

## Prior Sessions (Already Integrated)

- `frontend/src/hooks/useRouteCalculator.js`
- `frontend/src/pages/Publish.jsx`, `BrowseCommutes.jsx`, `Layout.jsx`
- `frontend/src/utils/commuteSort.js`, `commuteFilters.js`
- `frontend/src/services/realtime.js`, hooks
- `backend/src/routes/commutes.js`, `db/store.js`, `supabaseStore.js`
- `supabase/migrations/007_commute_route_storage.sql`

---

## Commands

```bash
# Verify OpenRouteService + stopovers
cd backend && npm run verify:routes

# Full test suite
cd backend && npm test

# Frontend build
cd frontend && npm run build
```

---

## Operational Notes

1. **Restart backend** after any `.env` change so `OPENROUTESERVICE_API_KEY` loads.
2. Long inter-city routes (e.g. Delhi → Jaipur) use ORS without alternatives; toll + no-toll routes still returned.
3. OSRM remains automatic fallback if ORS is unavailable.
