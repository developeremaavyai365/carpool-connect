import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLocation as useGeoLocation } from '../context/LocationContext';
import { commuteApi, employeeApi, locationApi, ridesApi } from '../services/api';
import CommuteCard from '../components/CommuteCard';
import CommuteDetailModal from '../components/CommuteDetailModal';
import LocationPicker from '../components/LocationPicker';
import MapPickerModal from '../components/MapPickerModal';
import { useCommuteListingRealtime } from '../hooks/useCommuteListingRealtime';
import { tripToCommuteCard } from '../utils/geospatialTripMapper';
import {
  sortCommutesForListing,
  mergeCommuteIntoList,
  removeCommuteFromList,
} from '../utils/commuteSort';
import { mergeSearchResults } from '../utils/mergeSearchResults';
import { groupCommutesByMatchType, hasGeospatialGroups } from '../utils/matchGroups';
import { matchTypeSectionLabel } from '../utils/geospatialTripMapper';
import { isCommuteOwnedByUser } from '../utils/commuteOwnership';
import './BrowseCommutes.css';

export default function BrowseCommutes() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { state: navState } = useLocation();
  const { position } = useGeoLocation();

  const [commutes, setCommutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [cities, setCities] = useState([]);
  const [liveUpdateFlash, setLiveUpdateFlash] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSegment, setPickerSegment] = useState('from');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSegment, setMapSegment] = useState('from');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [searchCoords, setSearchCoords] = useState(null);
  const [geospatialMode, setGeospatialMode] = useState(false);
  const [matchingRadiusKm, setMatchingRadiusKm] = useState(50);

  const flashTimer = useRef(null);
  const initializedRef = useRef(false);
  const searchRef = useRef(null);

  const mapCenter = position?.lat != null ? { lat: position.lat, lng: position.lng } : null;

  const handleLiveRide = useCallback((commute) => {
    if (isCommuteOwnedByUser(commute, user?.id)) return;
    let isNew = false;
    setCommutes((prev) => {
      isNew = !prev.some((c) => String(c.id) === String(commute.id));
      return mergeCommuteIntoList(prev, commute, { geospatialMode });
    });
    if (isNew) {
      setLiveUpdateFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setLiveUpdateFlash(false), 2500);
      addToast({
        title: 'New ride published',
        message: `${commute.route_from} → ${commute.route_to}`,
        type: 'info',
      });
    }
  }, [addToast, geospatialMode, user?.id]);

  const filterAvailableCommutes = useCallback((list) => (
    (list || []).filter((c) => !isCommuteOwnedByUser(c, user?.id))
  ), [user?.id]);

  const handleSelectCommute = useCallback((commute) => {
    if (isCommuteOwnedByUser(commute, user?.id)) {
      navigate('/my-commutes');
      return;
    }
    setSelected(commute);
  }, [navigate, user?.id]);

  const handleCommuteRemove = useCallback((commuteId) => {
    if (!commuteId) return;
    setCommutes((prev) => removeCommuteFromList(prev, commuteId));
    setSelected((current) => (current?.id === commuteId ? null : current));
  }, []);

  useCommuteListingRealtime({
    userId: user?.id,
    routeFrom,
    routeTo,
    date,
    city,
    geospatialMode,
    onCommuteUpsert: handleLiveRide,
    onCommuteRemove: handleCommuteRemove,
    searchRef,
    enabled: Boolean(user),
  });

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    employeeApi.getCities()
      .then(({ cities: list }) => setCities(list || []))
      .catch(() => setCities([]));
    ridesApi.matchingConfig?.()
      .then((cfg) => {
        if (cfg?.matching_radius_km) setMatchingRadiusKm(cfg.matching_radius_km);
      })
      .catch(() => {});
  }, []);

  const resolveCoords = useCallback(async (label, existing) => {
    if (existing?.lat != null && existing?.lng != null) return existing;
    if (!label?.trim()) return null;
    try {
      const { results } = await locationApi.search(label.trim());
      const hit = results?.[0];
      if (hit?.lat != null && hit?.lng != null) return { lat: hit.lat, lng: hit.lng };
    } catch { /* fall back to text search */ }
    return null;
  }, []);

  const runSearch = useCallback(async (filters) => {
    setLoading(true);
    try {
      const pickup = filters.fromCoords || fromCoords;
      const drop = filters.toCoords || toCoords;
      const resolvedPickup = await resolveCoords(filters.routeFrom, pickup);
      const resolvedDrop = await resolveCoords(filters.routeTo, drop);

      const textParams = {};
      if (filters.city?.trim()) textParams.city = filters.city.trim();
      if (filters.routeFrom?.trim()) textParams.route_from = filters.routeFrom.trim();
      if (filters.routeTo?.trim()) textParams.route_to = filters.routeTo.trim();
      if (filters.date) textParams.date = filters.date;

      // Always query published_commutes — source of truth for listings.
      const textRes = await commuteApi.search(textParams);
      let merged = textRes.commutes || [];

      if (resolvedPickup && resolvedDrop) {
        setFromCoords(resolvedPickup);
        setToCoords(resolvedDrop);
        setSearchCoords({
          pickup_lat: resolvedPickup.lat,
          pickup_lng: resolvedPickup.lng,
          drop_lat: resolvedDrop.lat,
          drop_lng: resolvedDrop.lng,
        });
        setGeospatialMode(true);

        try {
          const geoParams = {
            pickup_lat: resolvedPickup.lat,
            pickup_lng: resolvedPickup.lng,
            drop_lat: resolvedDrop.lat,
            drop_lng: resolvedDrop.lng,
          };
          if (filters.date) geoParams.date = filters.date;

          const geoRes = await ridesApi.search(geoParams);
          const geoCommutes = (geoRes.rides || []).map(tripToCommuteCard).filter(Boolean);
          merged = mergeSearchResults(merged, geoCommutes);
        } catch {
          /* Keep text-only results when geospatial search fails */
        }
      } else {
        setGeospatialMode(false);
        setSearchCoords(null);
      }

      merged = filterAvailableCommutes(merged);

      setCommutes(sortCommutesForListing(merged, {
        geospatialMode: Boolean(resolvedPickup && resolvedDrop),
      }));
    } catch (err) {
      setCommutes([]);
      addToast({ title: 'Search failed', message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addToast, fromCoords, toCoords, resolveCoords, filterAvailableCommutes]);

  searchRef.current = () => runSearch({ routeFrom, routeTo, date, city, fromCoords, toCoords });

  // Initialize once from dashboard navigation — never reset while user edits filters.
  useEffect(() => {
    if (!user || initializedRef.current) return;

    const from = navState?.route_from ?? '';
    const to = navState?.route_to ?? '';
    const searchDate = navState?.date ?? '';
    const searchCity = navState?.city ?? '';

    setRouteFrom(from);
    setRouteTo(to);
    setDate(searchDate);
    setCity(searchCity);
    initializedRef.current = true;

    runSearch({
      routeFrom: from,
      routeTo: to,
      date: searchDate,
      city: searchCity,
    });
  }, [user, navState?.route_from, navState?.route_to, navState?.date, navState?.city, runSearch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch({ routeFrom, routeTo, date, city });
  };

  const clearFilters = () => {
    setRouteFrom('');
    setRouteTo('');
    setCity('');
    setDate('');
    setFromCoords(null);
    setToCoords(null);
    setGeospatialMode(false);
    setSearchCoords(null);
    runSearch({});
  };

  const openPicker = (segment) => {
    setPickerSegment(segment);
    setPickerOpen(true);
  };

  const openMap = (segment) => {
    setMapSegment(segment);
    setMapOpen(true);
  };

  const handlePickerSelect = (label) => {
    if (pickerSegment === 'from') setRouteFrom(label);
    else setRouteTo(label);
  };

  const handleMapConfirm = (location) => {
    const label = mapSegment === 'from'
      ? (location.route_from || location.home_address || location.full_address || '')
      : (location.route_to || location.full_address || location.home_address || '');
    const coords = location.lat != null && location.lng != null
      ? { lat: location.lat, lng: location.lng }
      : null;
    if (mapSegment === 'from') {
      setRouteFrom(label);
      if (coords) setFromCoords(coords);
    } else {
      setRouteTo(label);
      if (coords) setToCoords(coords);
    }
    if (location.city && !city) setCity(location.city);
  };

  const hasFilters = Boolean(routeFrom.trim() || routeTo.trim() || city.trim() || date);

  return (
    <>
      <header className="browse-header">
        <div className="browse-header-row">
          <div>
            <h1>Find a commute</h1>
            <p>
              Browse published rides — view details, preferences, and request a seat.
              {geospatialMode && (
                <span className="browse-radius-hint">
                  {' '}Matching within {matchingRadiusKm} km of route waypoints.
                </span>
              )}
              {liveUpdateFlash && <span className="browse-live-badge"> · Live update</span>}
            </p>
          </div>
          <Link to="/publish-commute" className="btn btn-primary btn-sm">Publish yours</Link>
        </div>
      </header>

      <form className="browse-filters card" onSubmit={handleSubmit}>
        <div className="browse-filter-row">
          <div className="form-group">
            <label htmlFor="browse-from">From</label>
            <button
              type="button"
              id="browse-from"
              className={`browse-location-btn ${routeFrom ? 'is-filled' : 'is-empty'}`}
              onClick={() => openPicker('from')}
            >
              {routeFrom || 'Pickup area — tap to search'}
            </button>
          </div>
          <div className="form-group">
            <label htmlFor="browse-to">To</label>
            <button
              type="button"
              id="browse-to"
              className={`browse-location-btn ${routeTo ? 'is-filled' : 'is-empty'}`}
              onClick={() => openPicker('to')}
            >
              {routeTo || 'Destination — tap to search'}
            </button>
          </div>
          <div className="form-group">
            <label htmlFor="browse-city">City (optional)</label>
            <select
              id="browse-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="browse-date">Date (optional)</label>
            <input
              id="browse-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="browse-filter-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching…' : 'Search commutes'}
          </button>
          {hasFilters && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={loading}>
              Show all rides
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="loading-inline"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : commutes.length === 0 ? (
        <div className="empty-state card">
          <h3>No commutes found</h3>
          <p>
            {hasFilters
              ? 'No rides match your filters. Try clearing filters or searching a different area.'
              : 'No rides are published yet. Be the first to publish a commute!'}
          </p>
          {hasFilters && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Show all rides
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="browse-results-count">
            {commutes.length} ride{commutes.length === 1 ? '' : 's'} found
            {geospatialMode && (
              <span className="browse-live-badge"> · {matchingRadiusKm} km radius match</span>
            )}
          </p>

          <div className="browse-results-layout">
          {geospatialMode && hasGeospatialGroups(commutes) ? (
            (() => {
              const groups = groupCommutesByMatchType(commutes);
              const sections = ['exact', 'nearby', 'recommended'].filter((k) => groups[k]?.length);
              return sections.map((key) => (
                <section key={key} className="browse-match-section">
                  <h2 className="browse-match-section-title">{matchTypeSectionLabel(key)}</h2>
                  <div className="commute-grid">
                    {groups[key].map((c) => (
                      <CommuteCard key={c.id} commute={c} onSelect={handleSelectCommute} />
                    ))}
                  </div>
                </section>
              ));
            })()
          ) : (
            <div className="commute-grid">
              {commutes.map((c) => (
                <CommuteCard key={c.id} commute={c} onSelect={handleSelectCommute} />
              ))}
            </div>
          )}
          {geospatialMode && hasGeospatialGroups(commutes) && groupCommutesByMatchType(commutes).other.length > 0 && (
            <section className="browse-match-section">
              <h2 className="browse-match-section-title">Other rides</h2>
              <div className="commute-grid">
                {groupCommutesByMatchType(commutes).other.map((c) => (
                  <CommuteCard key={c.id} commute={c} onSelect={handleSelectCommute} />
                ))}
              </div>
            </section>
          )}
          </div>
        </>
      )}

      <LocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        segment={pickerSegment}
        value={pickerSegment === 'from' ? routeFrom : routeTo}
        onSelect={handlePickerSelect}
        mapCenter={mapCenter}
        onOpenMap={openMap}
      />

      <MapPickerModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        segment={mapSegment === 'to' ? 'drop' : 'from'}
        initialCenter={mapCenter}
        onConfirm={(result) => handleMapConfirm(result.location)}
      />

      {selected && (
        <CommuteDetailModal
          commute={selected}
          onClose={() => setSelected(null)}
          onRequestSent={() => {
            setSelected(null);
            searchRef.current?.();
          }}
        />
      )}
    </>
  );
}
