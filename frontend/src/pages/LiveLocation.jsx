import { Link } from 'react-router-dom';
import { useLocation } from '../context/LocationContext';
import LiveMap from '../components/LiveMap';
import { formatAccuracy } from '../utils/geo';
import '../components/LiveMap.css';
import './LiveLocation.css';

export default function LiveLocation() {
  const {
    position,
    address,
    permission,
    error,
    tracking,
    startTracking,
    stopTracking,
    colleagues,
    nearbyCount,
  } = useLocation();

  return (
    <>
      <div className="page-header">
        <h1>Live Location</h1>
        <p>Real-time map of your position and fellow travelers nearby in {address?.city || 'your city'}.</p>
      </div>

      <div className="card live-map-card">
        <div className="live-map-card-header">
          <div className="live-map-status">
            <span className={`live-map-status-dot ${tracking ? 'active' : ''}`} />
            {tracking ? 'Live tracking active' : 'Tracking paused'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!tracking ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={startTracking}>
                Enable location
              </button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={stopTracking}>
                Pause tracking
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            {permission === 'denied' && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                On mobile: Settings → Browser → Location → Allow for this site.
              </p>
            )}
          </div>
        )}

        {!position && !error && (
          <div className="live-map-permission">
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p>Requesting location permission and acquiring GPS fix…</p>
            <button type="button" className="btn btn-primary" onClick={startTracking}>
              Allow location access
            </button>
          </div>
        )}

        {(position || colleagues.length > 0) && (
          <div className="live-map-frame">
            <LiveMap position={position} colleagues={colleagues} />
          </div>
        )}

        {position && (
          <dl className="live-map-meta">
            <div>
              <dt>Coordinates</dt>
              <dd>{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{formatAccuracy(position.accuracy)} ({Math.round(position.accuracy || 0)} m)</dd>
            </div>
            <div>
              <dt>Nearby travelers</dt>
              <dd>{nearbyCount} within 15 km</dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{address?.home_address || address?.route_from || 'Resolving…'}</dd>
            </div>
          </dl>
        )}

        {colleagues.length > 0 && (
          <div>
            <h3 className="card-title" style={{ fontSize: '0.9375rem' }}>Travelers on the map</h3>
            <div className="live-colleagues-list">
              {colleagues.map((c) => (
                <div key={c.userId} className="live-colleague-row">
                  <span>{c.name}</span>
                  <span className="text-muted">{c.route_from || 'En route'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="live-location-note">
        Location updates every ~12 seconds or when you move. Only travelers in your city who have tracking enabled are shown.
        {' '}
        <Link to="/browse-rides">Browse commutes</Link>
      </p>
    </>
  );
}
