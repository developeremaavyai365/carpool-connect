# 50 km Radius Matching — Implementation Report

**Date:** 2026-06-11  
**Feature:** Configurable geospatial radius matching integrated into existing Carpool Connect search, publish, and booking flows.

---

## Summary

Passengers can discover rides when their pickup and destination fall within **50 km** (configurable) of the driver's **source, stopovers, or destination**, with **direction verification** and **weighted match scoring**. No duplicate matching system was created — all logic extends the existing PostGIS `/api/rides/search` pipeline and browse merge flow.

---

## 1. Files Modified

### Backend
| File | Change |
|------|--------|
| `backend/src/modules/rides/config/constants.ts` | `MATCHING_RADIUS_KM` from env; default 50 km |
| `backend/src/modules/rides/utils/coverage.ts` | **New** — coverage waypoints, direction check, match classification |
| `backend/src/modules/rides/utils/geospatial.ts` | Uses configurable radius via constants |
| `backend/src/modules/rides/repositories/trip.repository.ts` | Stores coverage; PostGIS radius search |
| `backend/src/modules/rides/services/trip.service.ts` | Builds coverage on publish/update |
| `backend/src/modules/rides/services/matching.service.ts` | Waypoint + polyline verification |
| `backend/src/modules/rides/services/ranking.service.ts` | Pickup/dest proximity scoring; match types |
| `backend/src/modules/rides/services/cache.service.ts` | Cache key includes radius |
| `backend/src/modules/rides/controllers/rides.controller.ts` | `GET /matching-config` |
| `backend/src/modules/rides/routes/rides.routes.ts` | Public matching-config route |
| `backend/src/modules/rides/types/dto.ts` | `stopover_coords`, match metadata fields |
| `backend/src/modules/rides/index.js` | Pass `stopover_coords` on geospatial sync |
| `backend/scripts/apply-migration-009.js` | **New** — apply DB migration |
| `backend/scripts/verify-radius-matching.js` | **New** — E2E radius tests |
| `backend/tests/coverage.test.js` | **New** — unit tests |
| `backend/package.json` | `verify:radius`, `migrate:009` scripts |
| `backend/.env.example` | `MATCHING_RADIUS_KM=50` |

### Database
| File | Change |
|------|--------|
| `supabase/migrations/009_matching_radius_coverage.sql` | **New** — coverage columns + GIST index |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/utils/geospatialTripMapper.js` | Match type + proximity fields |
| `frontend/src/utils/matchGroups.js` | **New** — group results by match type |
| `frontend/src/utils/commuteSort.js` | Sort exact → nearby → recommended |
| `frontend/src/utils/mergeSearchResults.js` | Preserve proximity metadata |
| `frontend/src/components/CommuteCard.jsx` | Match type + proximity tags |
| `frontend/src/components/CommuteCard.css` | Match type tag styles |
| `frontend/src/components/CommuteDetailModal.jsx` | Proximity detail text |
| `frontend/src/components/PublishRouteMap.jsx` | Coverage radius circles on map |
| `frontend/src/pages/Publish.jsx` | 50 km discovery message |
| `frontend/src/pages/Publish.css` | Coverage hint styling |
| `frontend/src/pages/BrowseCommutes.jsx` | Grouped sections; radius hint |
| `frontend/src/pages/BrowseCommutes.css` | Match section styles |
| `frontend/src/services/api.js` | `ridesApi.matchingConfig()` |

---

## 2. Matching Engine Changes

### Coverage waypoints (on publish)
Each trip stores ordered points: **source → stopovers → destination** as:
- `coverage_points` JSONB
- `coverage_geog` GEOGRAPHY(MultiPoint)
- `matching_radius_m` (from env, default 50000)

### Passenger search (6 steps)
1. Pickup within radius of any coverage point (PostGIS `ST_DWithin`)
2. Drop within radius of any coverage point
3. Direction: pickup waypoint index **<** drop waypoint index (rejects reverse)
4. Route line direction: `LineLocatePoint(pickup) < LineLocatePoint(drop)` when geometry exists
5. Status `active`, seats available, future departure
6. Weighted `match_score` + `match_type` classification

### Match types
| Type | Criteria |
|------|----------|
| `exact` | Pickup & drop ≤ 2 km from route waypoints |
| `nearby` | Either ≤ 15 km |
| `recommended` | Within full radius (50 km default) |

---

## 3. Database Changes

```sql
ALTER TABLE trips ADD coverage_points JSONB;
ALTER TABLE trips ADD matching_radius_m INTEGER DEFAULT 50000;
ALTER TABLE trips ADD coverage_geog geography(MultiPoint, 4326);
CREATE INDEX idx_trips_coverage_geog_gist ON trips USING GIST (coverage_geog);
```

Apply: `npm run migrate:009`

---

## 4. PostGIS Changes

- **GIST index** on `coverage_geog` for radius queries
- **Existing GIST** on `route_geometry` reused for corridor fallback
- Query uses `ST_DWithin(point, coverage_geog, matching_radius_m)` for both pickup and drop
- Direction enforced via `ST_LineLocatePoint` on route geometry

---

## 5. Query Changes

`TripRepository.searchCorridor()` now filters:
```sql
(coverage_geog ST_DWithin pickup AND drop)
OR (route_geometry ST_DWithin pickup AND drop)
AND LineLocatePoint(pickup) < LineLocatePoint(drop)
AND status = 'active' AND seats_available >= N AND departure_at >= now()
```

---

## 6. Realtime Changes

No new channels. Existing flows invalidate search cache on:
- `trip:created`, `trip:updated`, `trip:cancelled`
- `trip:booked`, `seat_changed`

Browse page `useCommuteListingRealtime` continues to refresh listings without page reload.

---

## 7. Performance Optimizations

- Coverage stored at publish time — **not recomputed per search**
- GIST indexes on `coverage_geog` and `route_geometry`
- Search results cached 60s with radius in cache key
- SQL prefilter before JS waypoint verification
- `LIMIT 100` on corridor query

---

## 8. Configuration

```env
MATCHING_RADIUS_KM=50
```

Exposed via `GET /api/rides/matching-config` for frontend map circles and UI copy.

---

## 9. Test Scenarios Executed

| Scenario | Result |
|----------|--------|
| Faridabad → Neemrana on Delhi → Jaipur | ✓ nearby (25.2 km pickup) |
| Ghaziabad → Cyber City on Noida → Gurgaon | ✓ |
| Thane → Lonavala on Mumbai → Pune (Lonavala stopover) | ✓ |
| Delhi → Jaipur exact | ✓ exact match |
| Jaipur → Gurgaon reverse on Delhi → Jaipur | ✓ rejected |
| Bangalore → Mysore | ✓ |
| Match score returned | ✓ |
| Unit tests (coverage.test.js) | 5/5 pass |
| Full backend test suite | 41/41 pass |

Run: `npm run verify:radius`

---

## 10. Verification

Rides within the configurable **50 km radius** of source, stopovers, and destination are discoverable via Browse (geocoded search), ranked by score, bookable via instant book, and visible on the publish map with coverage circles.

**Production steps:**
1. `npm run migrate:009`
2. `npm run build:rides`
3. Set `MATCHING_RADIUS_KM=50` in production `.env`
4. `npm run verify:radius` against staging

---

*Integrated into Carpool Connect — no RideShare / duplicate implementations.*
