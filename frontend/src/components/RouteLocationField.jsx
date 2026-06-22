import './RoutePlanner.css';

export default function RouteLocationField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onActivate,
  isActive = false,
  loading = false,
  error = '',
  mapFilled = false,
  autoMapFilled = false,
  profileFilled = false,
  quiet = false,
  variant = 'from',
  autoComplete = 'address-level3',
}) {
  const statusId = `${id}-status`;

  let statusText = '';
  let statusClass = 'route-field-status';
  if (loading) {
    statusText = 'Detecting location from map…';
    statusClass += ' is-loading';
  } else if (mapFilled && value && !quiet) {
    statusText = autoMapFilled
      ? 'Auto-filled from map'
      : 'Selected from map';
    statusClass += ' is-map';
  } else if (profileFilled && value && !quiet) {
    statusText = 'From your profile';
    statusClass += ' is-profile';
  } else if (error) {
    statusText = error;
    statusClass += ' is-error';
  }

  return (
    <div
      className={`route-field route-field-${variant} ${isActive ? 'route-field-active' : ''}`}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate?.(); }}
      role="presentation"
    >
      <div className="route-field-marker" aria-hidden="true">
        <span className={`route-field-dot ${variant}`} />
        {variant === 'from' && <span className="route-field-line" />}
      </div>

      <div className="route-field-body">
        <label htmlFor={id} className="route-field-label">
          {label}
        </label>

        <div className="route-field-input-row route-field-input-manual">
          <input
            id={id}
            name={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onActivate}
            placeholder={placeholder}
            autoComplete={autoComplete}
            aria-describedby={statusText ? statusId : undefined}
            aria-invalid={Boolean(error)}
            className={mapFilled ? 'route-input-map' : ''}
          />
        </div>

        {statusText && (
          <p id={statusId} className={statusClass} role="status">
            {mapFilled && !loading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}
