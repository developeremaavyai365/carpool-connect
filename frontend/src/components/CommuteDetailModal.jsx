import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import {
  formatDeparture, formatPrice, labelFor,
  SMOKING_OPTIONS, MUSIC_OPTIONS, PETS_OPTIONS,
} from '../utils/commuteLabels';
import { requestApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isCommuteOwnedByUser } from '../utils/commuteOwnership';
import './CommuteDetailModal.css';

function resolveCommuteId(commute) {
  const raw = commute?.commute_id ?? commute?.id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function CommuteDetailModal({
  commute,
  onClose,
  onRequestSent,
}) {
  const { user, refreshCounts } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const isOwn = isCommuteOwnedByUser(commute, user?.id);
  const isGeospatial = Boolean(commute.geospatial);

  const requestSeat = async () => {
    if (isOwn) {
      addToast({ title: 'Not allowed', message: 'You cannot request a seat on your own commute.', type: 'warning' });
      return;
    }

    const commuteId = resolveCommuteId(commute);
    if (!commuteId) {
      addToast({ title: 'Request failed', message: 'This ride cannot be requested right now. Try again later.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      await requestApi.create({
        receiver_id: commute.driver_id,
        commute_id: commuteId,
        message: message.trim() || `Hi! I'd like to join your commute on ${formatDeparture(commute.departure_at)}.`,
      });
      addToast({
        title: 'Request sent',
        message: `Your seat request was sent to ${commute.driver_name}. They will accept or decline.`,
        type: 'success',
      });
      refreshCounts();
      onRequestSent?.();
      onClose();
    } catch (err) {
      addToast({ title: 'Could not send request', message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="commute-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {isOwn && (
          <div className="commute-detail-owner-badge" role="status">
            Your commute · Driver
          </div>
        )}

        <header className="commute-detail-header">
          <div className="commute-detail-driver">
            <Avatar name={commute.driver_name} size="lg" />
            <div>
              <h2>{commute.driver_name}</h2>
              <p>{commute.driver_city || commute.city}</p>
            </div>
          </div>
          <div className="commute-detail-price">
            <strong>{formatPrice(commute.price_per_seat)}</strong>
            {commute.price_per_seat > 0 && <span>per seat</span>}
          </div>
        </header>

        {isGeospatial && !isOwn && commute.match_score != null && (
          <p className="commute-detail-match">
            {commute.match_type_label && (
              <><strong>{commute.match_type_label}</strong> · </>
            )}
            Score: <strong>{commute.match_score}</strong>
            {commute.pickup_proximity_km != null && (
              <> · Pickup is {commute.pickup_proximity_km} km from driver&apos;s route</>
            )}
            {commute.dest_proximity_km != null && (
              <> · Destination is {commute.dest_proximity_km} km from route</>
            )}
            {commute.detour_km != null && ` · ~${commute.detour_km} km detour`}
          </p>
        )}

        <div className="commute-detail-route">
          <div className="commute-detail-point">
            <span className="commute-dot from" />
            <div>
              <span className="commute-detail-label">Departure</span>
              <strong>{commute.route_from}</strong>
            </div>
          </div>
          <div className="commute-detail-point">
            <span className="commute-dot to" />
            <div>
              <span className="commute-detail-label">Arrival</span>
              <strong>{commute.route_to}</strong>
            </div>
          </div>
        </div>

        <dl className="commute-detail-facts">
          <div>
            <dt>When</dt>
            <dd>{formatDeparture(commute.departure_at)}</dd>
          </div>
          <div>
            <dt>Seats</dt>
            <dd>{commute.seats_available} available</dd>
          </div>
        </dl>

        {!isOwn && (
          <section className="commute-detail-prefs" aria-label="Ride preferences">
            <h3>Preferences</h3>
            <ul>
              <li><span>Smoking</span><strong>{labelFor(commute.smoking, SMOKING_OPTIONS)}</strong></li>
              <li><span>Music</span><strong>{labelFor(commute.music, MUSIC_OPTIONS)}</strong></li>
              <li><span>Pets</span><strong>{labelFor(commute.pets, PETS_OPTIONS)}</strong></li>
            </ul>
          </section>
        )}

        {commute.notes && (
          <section className="commute-detail-notes">
            <h3>Additional information</h3>
            <p>{commute.notes}</p>
          </section>
        )}

        {!isOwn && (
          <>
            <p className="commute-detail-request-hint">
              Send a request — the driver must accept before your seat is confirmed.
            </p>
            <div className="form-group">
              <label htmlFor="commute-request-msg">Message to driver (optional)</label>
              <textarea
                id="commute-request-msg"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Introduce yourself or mention your pickup point…"
                maxLength={500}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={requestSeat}
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Request a seat'}
            </button>
          </>
        )}

        {isOwn && (
          <section className="commute-detail-owner-actions" aria-label="Manage your commute">
            <p className="commute-detail-own-hint">This is your published commute. Manage it from your driver dashboard.</p>
            <div className="commute-detail-owner-buttons">
              <Link to="/my-commutes" className="btn btn-primary btn-block" onClick={onClose}>
                Manage ride
              </Link>
              <Link to="/requests" className="btn btn-secondary btn-block" onClick={onClose}>
                View requests
              </Link>
              <Link
                to={`/publish-commute?edit=${commute.id}`}
                className="btn btn-secondary btn-block"
                onClick={onClose}
              >
                Edit commute
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
