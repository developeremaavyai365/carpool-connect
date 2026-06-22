import { useEffect, useRef, useState, useCallback } from 'react';
import { locationApi } from '../services/api';
import { useLocation } from '../context/LocationContext';
import { locationLabelForFrom, locationLabelForDrop } from '../utils/locationLabel';
import './LocationPicker.css';

function mapGeoError(code, fallbackMessage) {
  switch (code) {
    case 1:
      return 'Location permission denied. Enable GPS or pick from the list.';
    case 2:
      return 'Location unavailable. Search above or pick on map.';
    case 3:
      return 'GPS timed out. Search above or pick on map.';
    default:
      return fallbackMessage || 'Could not detect location. Search above or pick on map.';
  }
}

function truncate(str, max = 52) {
  if (!str || str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

export default function LocationPicker({
  open,
  onClose,
  segment = 'from',
  value,
  onSelect,
  recentItems = [],
  mapCenter,
  onOpenMap,
}) {
  const isFrom = segment === 'from';
  const title = isFrom ? 'Where are you leaving from?' : 'Where are you heading?';
  const { fetchCurrentAddress, startTracking, permission } = useLocation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery(value || '');
      setError('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, value, segment]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const runSearch = useCallback(async (q) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const center = mapCenter?.lat != null ? mapCenter : null;
      let results = [];
      try {
        const res = await locationApi.autocomplete(q.trim(), {
          lat: center?.lat,
          lng: center?.lng,
        });
        results = res.results || [];
      } catch {
        /* fallback below */
      }
      if (!results.length) {
        const res = await locationApi.search(q.trim());
        results = res.results || [];
      }
      setResults(results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [mapCenter]);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 320);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, runSearch]);

  const handleSelect = (label) => {
    if (!label?.trim()) return;
    onSelect(label.trim());
    onClose();
  };

  const handlePlacePick = (place) => {
    const label = place.label
      || (segment === 'from' ? locationLabelForFrom(place) : locationLabelForDrop(place))
      || place.full_address
      || '';
    handleSelect(label);
  };

  const handleRecentPick = (item) => {
    const label = isFrom ? item.route_from : item.route_to;
    if (label) handleSelect(label);
  };

  const handleUseCurrent = async () => {
    if (!isFrom) return;
    setLocating(true);
    setError('');
    try {
      if (permission === 'denied') {
        throw new Error('Location permission denied. Enable GPS or pick on the map.');
      }
      startTracking();
      const location = await fetchCurrentAddress({ fresh: true });
      const label = locationLabelForFrom(location);
      if (!label) throw new Error('Could not resolve your location. Try the map.');
      handleSelect(label);
    } catch (err) {
      const message = err.code != null
        ? mapGeoError(err.code, err.message)
        : mapGeoError(null, err.message);
      setError(message);
    } finally {
      setLocating(false);
    }
  };

  if (!open) return null;

  const filteredRecent = recentItems.filter((item) => {
    const label = isFrom ? item.route_from : item.route_to;
    return label?.trim();
  });

  return (
    <div className="location-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="location-picker-title">
      <div className="location-picker-sheet">
        <header className="location-picker-header">
          <button type="button" className="location-picker-back" onClick={onClose} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h2 id="location-picker-title">{title}</h2>
        </header>

        <div className="location-picker-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError('');
            }}
            placeholder="Enter the full address"
            autoComplete="off"
          />
          {query && (
            <button type="button" className="location-picker-clear" onClick={() => setQuery('')} aria-label="Clear">
              ×
            </button>
          )}
        </div>

        {error && <p className="location-picker-error">{error}</p>}

        <ul className="location-picker-list">
          {isFrom && (
            <li>
              <button type="button" className="location-picker-item" onClick={handleUseCurrent} disabled={locating}>
                <span className="location-picker-item-icon gps">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                </span>
                <span className="location-picker-item-text">
                  <strong>{locating ? 'Detecting location…' : 'Use current location'}</strong>
                </span>
                <span className="location-picker-chevron" aria-hidden="true">›</span>
              </button>
            </li>
          )}

          {onOpenMap && (
            <li>
              <button type="button" className="location-picker-item" onClick={() => { onClose(); onOpenMap(segment); }}>
                <span className="location-picker-item-icon map">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </span>
                <span className="location-picker-item-text">
                  <strong>Pick on map</strong>
                  <small>Tap to choose a precise spot</small>
                </span>
                <span className="location-picker-chevron" aria-hidden="true">›</span>
              </button>
            </li>
          )}

          {searching && (
            <li className="location-picker-status">Searching…</li>
          )}

          {!searching && results.length > 0 && results.map((place, idx) => (
            <li key={place.place_id || place.label || idx}>
              <button type="button" className="location-picker-item" onClick={() => handlePlacePick(place)}>
                <span className="location-picker-item-icon pin">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                </span>
                <span className="location-picker-item-text">
                  <strong>{truncate((place.label || place.full_address || '').split(',')[0], 40)}</strong>
                  <small>{truncate(place.label || place.full_address || '', 64)}</small>
                </span>
                <span className="location-picker-chevron" aria-hidden="true">›</span>
              </button>
            </li>
          ))}

          {!query && filteredRecent.length > 0 && (
            <>
              <li className="location-picker-section-label">Recent</li>
              {filteredRecent.map((item, i) => {
                const primary = isFrom ? item.route_from : item.route_to;
                const secondary = isFrom ? item.route_to : item.route_from;
                return (
                  <li key={`${primary}-${i}`}>
                    <button type="button" className="location-picker-item" onClick={() => handleRecentPick(item)}>
                      <span className="location-picker-item-icon recent">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      </span>
                      <span className="location-picker-item-text">
                        <strong>{truncate(primary, 44)}</strong>
                        {secondary && <small>{truncate(secondary, 52)}</small>}
                      </span>
                      <span className="location-picker-chevron" aria-hidden="true">›</span>
                    </button>
                  </li>
                );
              })}
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
