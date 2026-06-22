import { useState, useCallback } from 'react';
import RouteLocationField from './RouteLocationField';
import MapPickerModal from './MapPickerModal';
import './RoutePlanner.css';

export default function RoutePlanner({
  routeFrom,
  routeTo,
  onFromChange,
  onToChange,
  onMapConfirm,
  fromLoading,
  fromError,
  fromMapFilled,
  fromAutoMapFilled,
  dropMapFilled,
  fromProfileFilled,
  dropProfileFilled,
  mapCenter,
  children,
  compact = false,
}) {
  const [activeSegment, setActiveSegment] = useState('from');
  const [mapOpen, setMapOpen] = useState(false);

  const openMap = useCallback(() => setMapOpen(true), []);
  const closeMap = useCallback(() => setMapOpen(false), []);

  const handleMapConfirm = useCallback((result) => {
    onMapConfirm(activeSegment, result.location);
  }, [activeSegment, onMapConfirm]);

  const activeLabel = activeSegment === 'from' ? 'Pickup From' : 'Drop Location';

  return (
    <section
      className={`route-planner ${compact ? 'route-planner-compact' : ''}`}
      aria-label="Book your ride"
    >
      {!compact && (
        <header className="route-planner-header">
          <div className="route-planner-title-row">
            <span className="route-planner-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </span>
            <h2 className="route-planner-title">Book your ride</h2>
          </div>
        </header>
      )}

      <div className="route-segment-tabs" role="tablist" aria-label="Choose segment for map">
        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'from'}
          className={`route-segment-tab ${activeSegment === 'from' ? 'active' : ''}`}
          onClick={() => setActiveSegment('from')}
        >
          <span className="route-segment-tab-dot from" />
          Pickup From
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSegment === 'drop'}
          className={`route-segment-tab ${activeSegment === 'drop' ? 'active' : ''}`}
          onClick={() => setActiveSegment('drop')}
        >
          <span className="route-segment-tab-dot drop" />
          Drop Location
        </button>
      </div>

      <div className="route-planner-fields">
        <RouteLocationField
          id="route-from"
          label="Pickup From"
          placeholder="Starting point"
          value={routeFrom}
          onChange={onFromChange}
          onActivate={() => setActiveSegment('from')}
          isActive={activeSegment === 'from'}
          loading={fromLoading}
          error={fromError}
          mapFilled={fromMapFilled}
          autoMapFilled={fromAutoMapFilled}
          profileFilled={fromProfileFilled}
          quiet={compact}
          variant="from"
          autoComplete="address-level3"
        />

        <RouteLocationField
          id="route-drop"
          label="Drop Location"
          placeholder="Destination"
          value={routeTo}
          onChange={onToChange}
          onActivate={() => setActiveSegment('drop')}
          isActive={activeSegment === 'drop'}
          mapFilled={dropMapFilled}
          profileFilled={dropProfileFilled}
          quiet={compact}
          variant="drop"
          autoComplete="street-address"
        />
      </div>

      <button
        type="button"
        className="route-map-btn"
        onClick={openMap}
        aria-label={`Add from Map for ${activeLabel}`}
      >
        <span className="route-map-btn-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </span>
        <span className="route-map-btn-text">
          <strong>Add from Map</strong>
          {!compact && <small>for {activeLabel}</small>}
        </span>
      </button>

      <MapPickerModal
        open={mapOpen}
        onClose={closeMap}
        segment={activeSegment === 'drop' ? 'drop' : 'from'}
        initialCenter={mapCenter}
        onConfirm={handleMapConfirm}
      />

      {children}
    </section>
  );
}
