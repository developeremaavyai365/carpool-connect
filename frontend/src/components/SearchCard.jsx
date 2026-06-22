import { useState } from 'react';
import LocationPicker from './LocationPicker';
import MapPickerModal from './MapPickerModal';
import './SearchCard.css';

const DATE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
];

export default function SearchCard({
  routeFrom,
  routeTo,
  onFromChange,
  onToChange,
  onMapConfirm,
  mapCenter,
  recentSearches = [],
  onSearch,
  searching = false,
  seats = 1,
  submitLabel = 'Search',
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSegment, setPickerSegment] = useState('from');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSegment, setMapSegment] = useState('from');
  const [travelDate, setTravelDate] = useState('today');

  const openPicker = (segment) => {
    setPickerSegment(segment);
    setPickerOpen(true);
  };

  const openMap = (segment) => {
    setMapSegment(segment);
    setMapOpen(true);
  };

  const handleSelect = (label) => {
    if (pickerSegment === 'from') onFromChange(label);
    else onToChange(label);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({ travelDate, seats });
  };

  return (
    <>
      <form className="search-card" onSubmit={handleSubmit}>
        <div className="search-card-fields">
          <button type="button" className="search-card-row" onClick={() => openPicker('from')}>
            <span className="search-card-dot from" aria-hidden="true" />
            <span className="search-card-row-text">
              <span className="search-card-label">Leaving from</span>
              <span className={`search-card-value ${!routeFrom ? 'placeholder' : ''}`}>
                {routeFrom || 'Enter pickup point'}
              </span>
            </span>
          </button>

          <div className="search-card-divider" aria-hidden="true" />

          <button type="button" className="search-card-row" onClick={() => openPicker('to')}>
            <span className="search-card-dot to" aria-hidden="true" />
            <span className="search-card-row-text">
              <span className="search-card-label">Going to</span>
              <span className={`search-card-value ${!routeTo ? 'placeholder' : ''}`}>
                {routeTo || 'Enter destination'}
              </span>
            </span>
          </button>

          <div className="search-card-divider" aria-hidden="true" />

          <div className="search-card-meta">
            <div className="search-card-dates" role="group" aria-label="Travel date">
              {DATE_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`search-card-date ${travelDate === id ? 'active' : ''}`}
                  onClick={() => setTravelDate(id)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {label}
                </button>
              ))}
            </div>
            <div className="search-card-seats" aria-label="Seats needed">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{seats}</span>
            </div>
          </div>
        </div>

        <button type="submit" className="search-card-btn" disabled={searching || !routeFrom.trim()}>
          {searching ? (submitLabel === 'Search' ? 'Searching…' : 'Publishing…') : submitLabel}
        </button>
      </form>

      <LocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        segment={pickerSegment}
        value={pickerSegment === 'from' ? routeFrom : routeTo}
        onSelect={handleSelect}
        recentItems={recentSearches}
        mapCenter={mapCenter}
        onOpenMap={openMap}
      />

      <MapPickerModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        segment={mapSegment === 'drop' || mapSegment === 'to' ? 'drop' : 'from'}
        initialCenter={mapCenter}
        onConfirm={(result) => onMapConfirm(mapSegment, result.location)}
      />
    </>
  );
}
