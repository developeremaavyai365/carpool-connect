# Self-Booking Prevention — Fix Report

**Date:** 2026-06-06  
**Status:** Verified — all layers enforced, E2E + unit tests passing  
**Issue:** Drivers could discover and attempt to book/request seats on their own published commutes.

---

## 1. Root Cause

1. **Type coercion bug:** `commute.driver_id === user.id` failed when one value was a string and the other a number, so the UI treated own commutes as bookable (`isOwn === false`).
2. **Realtime leak:** Live publish events merged the driver's own commute into Browse without consistent ownership filtering.
3. **Incomplete API guards:** `POST /api/requests` blocked self-as-receiver but not **driver requesting seat on own `commute_id`**. Booking service relied on DB function without an explicit **403** at the API layer.
4. **Matching engine:** `excludeDriverId` used strict equality — inconsistent when IDs differed by type.

Database already had `book_trip_seats` check (`Cannot book your own trip`); API and UI did not surface it consistently.

---

## 2. Files Modified

### Backend
| File | Change |
|------|--------|
| `backend/src/utils/commuteOwnership.js` | **New** — `isSameUserId`, `isCommuteOwnedByUser` |
| `backend/src/routes/requests.js` | 403 when sender owns `commute_id` |
| `backend/src/modules/rides/services/trip.service.ts` | 403 before booking |
| `backend/src/modules/rides/controllers/rides.controller.ts` | Map own-book errors to 403 |
| `backend/src/modules/rides/repositories/booking.repository.ts` | Map PG exception to 403 |
| `backend/src/modules/rides/services/matching.service.ts` | Numeric `excludeDriverId` filter |
| `backend/src/db/supabaseStore.js` | Numeric ownership in search |
| `backend/src/db/store.js` | Numeric ownership in search (SQLite) |
| `backend/tests/api.test.js` | Self-booking tests |
| `backend/scripts/verify-self-booking.js` | **New** E2E verification |
| `backend/scripts/apply-migration-010.js` | **New** |

### Database
| File | Change |
|------|--------|
| `supabase/migrations/010_prevent_self_booking.sql` | Trigger on `carpool_requests` INSERT |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/utils/commuteOwnership.js` | **New** shared ownership helper |
| `frontend/src/utils/commuteFilters.js` | Numeric ownership filter |
| `frontend/src/components/CommuteDetailModal.jsx` | Owner badge, manage actions, guards |
| `frontend/src/components/CommuteDetailModal.css` | Owner UI styles |
| `frontend/src/pages/BrowseCommutes.jsx` | Filter own rides, redirect to `/my-commutes` |

---

## 3. Queries Modified

- `searchCommutes()` — `excludeDriverId` uses `isCommuteOwnedByUser()` (Supabase + SQLite)
- `book_trip_seats()` — unchanged (already blocks `driver_id = passenger_id`)
- **New trigger** `trg_carpool_request_no_self` on `carpool_requests`

---

## 4. API Validations Added

| Endpoint | Rule | Response |
|----------|------|----------|
| `POST /api/requests` | `commute.driver_id === sender_id` | **403** `"You cannot book your own commute."` |
| `POST /api/rides/book` | `trip.driver_id === passenger_id` | **403** `"You cannot book your own commute."` |
| `GET /api/commutes/search` | Excludes `driver_id === current user` | (no own rows) |
| `GET /api/rides/search` | Excludes own trips via `excludeDriverId` | (no own rows) |

---

## 5. UI Changes

- **CommuteDetailModal:** "Your commute · Driver" badge; **Manage ride**, **View requests**, **Edit commute** for owners; no Request/Book buttons
- **BrowseCommutes:** Client-side filter removes own commutes; clicking own card redirects to `/my-commutes`
- **Realtime:** Own publishes no longer appear in passenger browse list

---

## 6. Matching Engine

- `excludeDriverId` filtering uses `Number()` comparison in filter + cache
- Verified path and polyline verification also skip own `driver_id`

---

## 7. Dashboard

- Own commutes managed at `/my-commutes` (existing driver dashboard)
- Browse redirects owners there instead of passenger booking modal

---

## 8. Test Scenarios

| Scenario | Expected | Result |
|----------|----------|--------|
| Driver publishes Delhi → Jaipur | Success | ✓ |
| Driver browse search | Own commute excluded | ✓ |
| Driver seat request on own commute | 403 | ✓ |
| Driver instant book own trip | 403 | ✓ |
| Passenger request same commute | 201/409 | ✓ |
| Geo search as driver | Own trips excluded | ✓ |
| Unit tests `api.test.js` | 43/43 | ✓ |

Run: `npm run verify:own-booking`

**Latest E2E run (after backend restart):**
```
✓ Browse search excludes own commute
✓ Seat request on own commute rejected (403)
✓ Geo search excludes own trips
✓ Instant book on own trip rejected (403)
✓ Other passenger can request seat
```

**Unit tests:** 43/43 pass (`npm test`)  
**Frontend build:** pass (`npm run build`)

---

## 9. Verification Checklist

- ✓ Driver cannot book own commute (API 403 + DB)
- ✓ Driver cannot request own seat (API 403 + DB trigger)
- ✓ Browse hides own commutes from passenger list
- ✓ UI shows Manage Ride for owners
- ✓ Matching engine excludes own rides
- ✓ Mobile/desktop responsive owner actions
- ✓ Realtime no longer injects own rides into browse

---

*Integrated into Carpool Connect — no duplicate implementations.*
