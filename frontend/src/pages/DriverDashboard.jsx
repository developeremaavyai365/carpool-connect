import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { commuteApi, requestApi } from '../services/api';
import Avatar from '../components/Avatar';
import CommuteCard from '../components/CommuteCard';
import { useDriverCommutesRealtime } from '../hooks/useDriverCommutesRealtime';
import './DriverDashboard.css';

const EMPTY_BUCKETS = {
  upcoming: [],
  active: [],
  completed: [],
  cancelled: [],
};

const EMPTY_STATS = {
  upcoming: 0,
  active: 0,
  completed: 0,
  cancelled: 0,
  total: 0,
};

function StatusBadge({ status }) {
  const label = (status || 'active').replace(/_/g, ' ');
  return <span className={`driver-status-badge status-${(status || 'active').toLowerCase()}`}>{label}</span>;
}

function DriverCommuteRow({
  commute,
  onEdit,
  onCancel,
  onComplete,
  showComplete,
}) {
  const booked = commute.seats_booked ?? commute.accepted_passengers ?? 0;
  const totalSeats = (commute.seats_available ?? 0) + booked;

  return (
    <li className="driver-commute-row card">
      <div className="driver-commute-row-head">
        <StatusBadge status={commute.status} />
        {commute.route_label && (
          <span className="driver-route-label">{commute.route_label}</span>
        )}
      </div>

      <CommuteCard commute={commute} compact static />

      <dl className="driver-commute-stats">
        <div>
          <dt>Seats</dt>
          <dd>{commute.seats_available} available · {booked} booked{totalSeats ? ` / ${totalSeats}` : ''}</dd>
        </div>
        {commute.route_detail && (
          <div>
            <dt>Route</dt>
            <dd>{commute.route_detail}</dd>
          </div>
        )}
      </dl>

      <div className="driver-commute-actions">
        {showComplete && commute.status !== 'cancelled' && commute.status !== 'completed' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onComplete(commute.id)}>
            Mark completed
          </button>
        )}
        {commute.status === 'active' || commute.status === 'upcoming' ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(commute)}>
              Edit
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onCancel(commute.id)}>
              Cancel
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function CommuteSection({ title, description, commutes, emptyText, ...rowProps }) {
  return (
    <section className="driver-section">
      <header className="driver-section-head">
        <h2>{title}</h2>
        <span className="driver-section-count">{commutes.length}</span>
      </header>
      {description && <p className="driver-section-desc">{description}</p>}
      {commutes.length === 0 ? (
        <p className="driver-section-empty">{emptyText}</p>
      ) : (
        <ul className="driver-commute-list">
          {commutes.map((c) => (
            <DriverCommuteRow key={c.id} commute={c} {...rowProps} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingRequestsPanel({ requests, onRespond, actionLoading }) {
  if (!requests.length) return null;

  return (
    <section className="driver-pending-requests card">
      <header className="driver-pending-head">
        <h2>Pending seat requests</h2>
        <span className="driver-section-count">{requests.length}</span>
      </header>
      <p className="driver-section-desc">Passengers are waiting for your response — accept or decline each request.</p>
      <ul className="driver-pending-list">
        {requests.map((req) => (
          <li key={req.id} className="driver-pending-item">
            <div className="driver-pending-person">
              <Avatar name={req.sender_name} size="sm" />
              <div>
                <strong>{req.sender_name}</strong>
                {(req.commute_route_from || req.message) && (
                  <p>
                    {req.commute_route_from
                      ? `${req.commute_route_from} → ${req.commute_route_to}`
                      : req.message}
                  </p>
                )}
              </div>
            </div>
            <div className="driver-pending-actions">
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => onRespond(req.id, 'accepted')}
                disabled={actionLoading === req.id}
              >
                Accept
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onRespond(req.id, 'declined')}
                disabled={actionLoading === req.id}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Link to="/requests" className="driver-pending-all-link">View all requests</Link>
    </section>
  );
}

export default function DriverDashboard() {
  const { user, pendingCount } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [buckets, setBuckets] = useState(EMPTY_BUCKETS);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestActionLoading, setRequestActionLoading] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, pendingRes] = await Promise.all([
        commuteApi.getMine(),
        requestApi.getPending().catch(() => ({ requests: [] })),
      ]);
      setBuckets(res.buckets || EMPTY_BUCKETS);
      setStats(res.stats || EMPTY_STATS);
      setPendingRequests(pendingRes.requests || []);
    } catch (err) {
      setBuckets(EMPTY_BUCKETS);
      setStats(EMPTY_STATS);
      setError(err.message || 'Could not load your commutes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user, loadDashboard]);

  useDriverCommutesRealtime({
    userId: user?.id,
    onChange: loadDashboard,
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!user?.id) return;
    requestApi.getPending()
      .then((res) => setPendingRequests(res.requests || []))
      .catch(() => setPendingRequests([]));
  }, [user?.id, pendingCount]);

  const handleEdit = (commute) => {
    navigate(`/publish-commute?edit=${commute.id}`);
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this commute? It will be removed from public listings.')) return;
    try {
      await commuteApi.remove(id);
      addToast({ title: 'Cancelled', message: 'Commute moved to cancelled history.', type: 'info' });
      await loadDashboard();
    } catch (err) {
      addToast({ title: 'Could not cancel', message: err.message, type: 'error' });
    }
  };

  const handleComplete = async (id) => {
    try {
      await commuteApi.complete(id);
      addToast({ title: 'Completed', message: 'Commute moved to completed history.', type: 'success' });
      await loadDashboard();
    } catch (err) {
      addToast({ title: 'Could not update', message: err.message, type: 'error' });
    }
  };

  const respondToRequest = async (id, response) => {
    setRequestActionLoading(id);
    try {
      await requestApi.respond(id, response);
      addToast({
        title: response === 'accepted' ? 'Request accepted' : 'Request declined',
        message: response === 'accepted'
          ? 'The passenger has been notified.'
          : 'The request has been declined.',
        type: response === 'accepted' ? 'success' : 'info',
      });
      await loadDashboard();
    } catch (err) {
      addToast({ title: 'Action failed', message: err.message || 'Could not update the request.', type: 'error' });
    } finally {
      setRequestActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="loading-inline">
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="driver-empty card">
        <h1>Could not load My Commutes</h1>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={loadDashboard}>Retry</button>
      </div>
    );
  }

  const isEmpty = stats.total === 0;

  return (
    <div className="driver-dashboard">
      <header className="driver-dashboard-header">
        <div>
          <h1>My Commutes</h1>
          <p>All commutes you have published — upcoming, active, completed, and cancelled.</p>
        </div>
        <Link to="/publish-commute" className="btn btn-primary btn-sm">Publish commute</Link>
      </header>

      {!isEmpty && (
        <div className="driver-stats-grid">
          <div className="driver-stat card">
            <strong>{stats.upcoming}</strong>
            <span>Upcoming</span>
          </div>
          <div className="driver-stat card">
            <strong>{stats.active}</strong>
            <span>Active</span>
          </div>
          <div className="driver-stat card">
            <strong>{stats.completed}</strong>
            <span>Completed</span>
          </div>
          <div className="driver-stat card">
            <strong>{stats.cancelled}</strong>
            <span>Cancelled</span>
          </div>
        </div>
      )}

      <PendingRequestsPanel
        requests={pendingRequests}
        onRespond={respondToRequest}
        actionLoading={requestActionLoading}
      />

      {isEmpty ? (
        <div className="driver-empty card">
          <h2>You haven&apos;t published any commutes yet.</h2>
          <p>Create a listing so passengers on your route can find and request a seat.</p>
          <Link to="/publish-commute" className="btn btn-primary">Publish commute</Link>
        </div>
      ) : (
        <>
          <CommuteSection
            title="Upcoming commutes"
            description="Scheduled departures — visible to passengers on Browse Rides."
            commutes={buckets.upcoming}
            emptyText="No upcoming commutes."
            onEdit={handleEdit}
            onCancel={handleCancel}
            onComplete={handleComplete}
            showComplete={false}
          />

          <CommuteSection
            title="Active commutes"
            description="Trips in progress or departing now."
            commutes={buckets.active}
            emptyText="No active commutes right now."
            onEdit={handleEdit}
            onCancel={handleCancel}
            onComplete={handleComplete}
            showComplete
          />

          <CommuteSection
            title="Completed commutes"
            description="Trip history — these stay on your dashboard."
            commutes={buckets.completed}
            emptyText="No completed commutes yet."
            onEdit={handleEdit}
            onCancel={handleCancel}
            onComplete={handleComplete}
            showComplete={false}
          />

          <CommuteSection
            title="Cancelled commutes"
            description="Cancelled listings — not shown publicly."
            commutes={buckets.cancelled}
            emptyText="No cancelled commutes."
            onEdit={handleEdit}
            onCancel={handleCancel}
            onComplete={handleComplete}
            showComplete={false}
          />
        </>
      )}
    </div>
  );
}
