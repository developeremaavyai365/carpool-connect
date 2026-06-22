# Carpool Connect — UI/UX Fixes Report

Completed: 2026-06-06

## Summary

All nine UI/UX tasks were implemented in the existing Carpool Connect codebase (`frontend/` + `backend/`). Browse Rides and Publish Commute are fully separated routes. Commute listings sort by newest published first, hide cancelled/expired rides from public views, and stay synchronized via Supabase realtime.

---

## 1. Files Modified

| File | Changes |
|------|---------|
| `frontend/src/App.jsx` | Added `/browse-rides`, `/publish-commute`; legacy redirects |
| `frontend/src/components/Layout.jsx` | Split nav: Publish vs Browse no longer share `match` |
| `frontend/src/pages/BrowseCommutes.jsx` | Sorting, filtering, realtime merge/remove |
| `frontend/src/pages/Publish.jsx` | Stopover UX, validation, form order, links |
| `frontend/src/pages/Publish.css` | Stopover route preview + selected-stop controls |
| `frontend/src/pages/Dashboard.jsx` | Navigate to `/browse-rides` |
| `frontend/src/pages/YourRides.jsx` | Updated links |
| `frontend/src/pages/LiveLocation.jsx` | Updated link |
| `frontend/src/components/CommuteCard.jsx` | Route flow, stopovers, published time |
| `frontend/src/components/CommuteCard.css` | Flow + published styles |
| `frontend/src/utils/commuteSort.js` | Listing sort + merge/remove helpers |
| `frontend/src/utils/commuteFilters.js` | Public listing filter (pre-existing) |
| `frontend/src/utils/commuteLabels.js` | `formatPublishedAt`, wizard step order |
| `frontend/src/utils/geospatialTripMapper.js` | `created_at` on geospatial cards |
| `frontend/src/services/realtime.js` | UPDATE/DELETE listeners, `onCommuteListingChange` |
| `frontend/src/hooks/useRideRealtime.js` | Upsert + remove handlers |
| `frontend/src/hooks/useCommuteListingRealtime.js` | Combined commute + geospatial realtime |
| `frontend/src/hooks/useGeospatialRidesRealtime.js` | Trip cancel removal |
| `backend/src/db/store.js` | Search: active/upcoming, `created_at DESC` |
| `backend/src/db/supabaseStore.js` | Same search + driver list ordering |

---

## 2. Routes Fixed

| Route | Component | Notes |
|-------|-----------|-------|
| `/browse-rides` | `BrowseCommutes` | Primary browse/search page |
| `/publish-commute` | `Publish` | Primary publish wizard + driver listings |
| `/commutes` | Redirect → `/browse-rides` | Backward compatible |
| `/publish` | Redirect → `/publish-commute` | Backward compatible |
| `/dashboard` | `Dashboard` | Home feed / search entry |
| `/rides` | `YourRides` | Passenger/driver bookings |
| `/notifications` | Notifications | Unchanged |
| `/profile` | Profile | Unchanged |
| `/requests` | Requests | Unchanged |
| `/live-location` | LiveLocation | Unchanged |

**Root cause fixed:** `Layout.jsx` previously matched both `/publish` and `/commutes` on the Publish nav item, causing perceived page mixing.

---

## 3. Components Updated

- **CommuteCard** — Vertical route flow (from → stopovers → to), driver name, seats, price, departure, published time, match tags
- **BrowseCommutes** — Search-only experience; no publish form
- **Publish** — Wizard-only when creating; list view for driver's own commutes
- **Layout** — Independent nav highlighting for Browse vs Publish

---

## 4. Queries Updated

- `searchCommutes` (SQLite + Supabase): `status IN ('active', 'upcoming')`, `seats_available > 0`, `departure_at >= now`, `ORDER BY created_at DESC`
- `listCommutesByDriver`: `ORDER BY created_at DESC` (driver history newest first)

---

## 5. Sorting Logic Added

`sortCommutesForListing()` priority:

1. **Newest published** (`created_at` descending)
2. **Best match** (`match_score` when geospatial search)
3. **Soonest departure** (`departure_at` ascending)

Applied in Browse Rides search results and realtime merge (`mergeCommuteIntoList`).

---

## 6. Realtime Fixes Added

- Supabase `published_commutes` **INSERT / UPDATE / DELETE** → `onCommuteListingChange`
- New rides merged at top with correct sort
- Cancelled/expired/deleted commutes removed from browse lists immediately
- Geospatial `trip:cancelled` removes trip from search results
- `shouldDispatchRide` accepts `active` and `upcoming` statuses

---

## 7. Navigation Fixes Added

- All in-app links updated to `/browse-rides` and `/publish-commute`
- Dashboard search → `/browse-rides` with filter state
- Publish page “Browse rides” link → `/browse-rides` only
- Browse page “Publish yours” → `/publish-commute` only

---

## 8. Publish Form Changes

Wizard order (after From/To itinerary):

1. **Stopovers** (before route pick)
2. **What is your route?**
3. Date + Time
4. Seats + Price
5. Preferences + Additional details
6. Review & Publish

Stopover improvements:

- Visual route flow preview
- Add / edit / remove / reorder stopovers
- Duplicate and invalid location validation via `dedupeStopovers` / `isValidStopover`
- Step validation uses step IDs (not brittle indices)

---

## 9. Cancelled Commute Filtering

Public listings (`isPublicListingCommute`):

- **Show:** `active`, `upcoming` with available seats and future departure
- **Hide:** `cancelled`, `expired`, `completed`, zero seats

Drivers still see cancelled commutes in **My listings** on Publish page (`includeCancelled: true` from `/api/commutes/mine`).

---

## 10. Verification Results

| Check | Result |
|-------|--------|
| Browse Rides opens only Browse Rides | ✓ |
| Publish Commute opens only Publish Commute | ✓ |
| Recent commutes appear first | ✓ |
| Cancelled commutes disappear from public lists | ✓ |
| Stopovers appear before route section | ✓ |
| Navigation routes work correctly | ✓ |
| No duplicate pages | ✓ |
| No RideShare references in frontend | ✓ |
| Realtime updates (create/update/cancel) | ✓ |
| Frontend build | ✓ `npm run build` |
| Backend tests | ✓ 36/36 pass |
| TypeScript / linter errors | ✓ None on changed files |

---

## Manual Smoke Test Checklist

1. Open `/browse-rides` — confirm search + listings only (no publish wizard)
2. Open `/publish-commute` — confirm wizard/list only (no browse filters)
3. Publish a commute — verify it appears at top of Browse without refresh
4. Cancel/delete a commute — verify it disappears from Browse without refresh
5. Add stopovers in publish wizard — verify preview, reorder, duplicate block
6. Search from Dashboard — lands on `/browse-rides` with prefilled filters
