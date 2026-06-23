import Avatar from './Avatar';
import { formatDeparture, formatPrice, formatPublishedAt } from '../utils/commuteLabels';
import './CommuteCard.css';

function RouteFlow({ from, stopovers = [], to }) {
  const points = [from, ...stopovers.filter(Boolean), to].filter(Boolean);
  if (points.length < 2) return null;

  return (
    <div className="commute-card-flow" aria-label="Route">
      {points.map((place, index) => (
        <div key={`${place}-${index}`} className="commute-card-flow-row">
          {index > 0 && <span className="commute-card-flow-arrow" aria-hidden="true">↓</span>}
          <span className={`commute-card-flow-point ${index === 0 ? 'from' : index === points.length - 1 ? 'to' : 'stop'}`}>
            {place}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CommuteCard({ commute, onSelect, compact = false, static: isStatic = false, showDriverContact = false }) {
  const priceLabel = formatPrice(commute.price_per_seat);
  const stopovers = Array.isArray(commute.stopovers) ? commute.stopovers : [];
  const className = `commute-card ${compact ? 'compact' : ''} ${isStatic ? 'static' : ''}`;

  const vehicle = commute.driver_vehicle;
  const vehicleStr = vehicle
    ? [vehicle.make, vehicle.model, vehicle.color, vehicle.plate].filter(Boolean).join(' · ')
    : null;

  const content = (
    <>
      <RouteFlow from={commute.route_from} stopovers={stopovers} to={commute.route_to} />

      <div className="commute-card-meta">
        <time dateTime={commute.departure_at}>{formatDeparture(commute.departure_at)}</time>
        <span className="commute-card-seats">{commute.seats_available} seat{commute.seats_available !== 1 ? 's' : ''}</span>
      </div>

      {commute.created_at && (
        <p className="commute-card-published">
          Published {formatPublishedAt(commute.created_at)}
        </p>
      )}

      <div className="commute-card-footer">
        <div className="commute-card-driver">
          <Avatar name={commute.driver_name} size="sm" />
          <span>{commute.driver_name}</span>
        </div>
        <div className="commute-card-price">
          <strong>{priceLabel}</strong>
          {commute.price_per_seat > 0 && <small>/ seat</small>}
        </div>
      </div>

      {showDriverContact && (commute.driver_phone || commute.driver_email || vehicleStr) && (
        <div className="commute-card-contact">
          <p className="commute-card-contact-title">Driver contact details</p>
          {commute.driver_phone && (
            <a href={`tel:${commute.driver_phone}`} className="commute-card-contact-row">
              <span>📞</span><span>{commute.driver_phone}</span>
            </a>
          )}
          {commute.driver_email && (
            <a href={`mailto:${commute.driver_email}`} className="commute-card-contact-row">
              <span>📧</span><span>{commute.driver_email}</span>
            </a>
          )}
          {vehicleStr && (
            <div className="commute-card-contact-row">
              <span>🚗</span><span>{vehicleStr}</span>
            </div>
          )}
        </div>
      )}

      <div className="commute-card-tags">
        {commute.geospatial && commute.match_type && (
          <span className={`commute-tag commute-tag-${commute.match_type}`}>
            {commute.match_type_label || commute.match_type}
          </span>
        )}
        {commute.geospatial && commute.match_score != null && (
          <span className="commute-tag commute-tag-match">Score {commute.match_score}</span>
        )}
        {commute.geospatial && commute.pickup_proximity_km != null && (
          <span className="commute-tag commute-tag-proximity">
            Pickup {commute.pickup_proximity_km} km from route
          </span>
        )}
        {commute.geospatial && commute.dest_proximity_km != null && (
          <span className="commute-tag commute-tag-proximity">
            Destination {commute.dest_proximity_km} km from route
          </span>
        )}
        {commute.geospatial && !commute.match_type && (
          <span className="commute-tag">Smart route</span>
        )}
        {stopovers.length > 0 && (
          <span className="commute-tag">{stopovers.length} stop{stopovers.length !== 1 ? 's' : ''}</span>
        )}
        {commute.smoking === 'not_allowed' && <span className="commute-tag">Non-smoking</span>}
        {commute.pets === 'allowed' && <span className="commute-tag">Pets OK</span>}
        {commute.music === 'quiet' && <span className="commute-tag">Quiet</span>}
      </div>
    </>
  );

  if (isStatic) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" className={className} onClick={() => onSelect?.(commute)}>
      {content}
    </button>
  );
}
