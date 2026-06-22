import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { requestApi } from '../services/api';
import Avatar from '../components/Avatar';
import './Requests.css';

export default function Requests() {
  const { user, refreshCounts } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'pending') {
        const res = await requestApi.getPending();
        setRequests(res.requests);
      } else {
        const res = await requestApi.getAll(tab);
        setRequests(res.requests);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab]);

  const respond = async (id, response) => {
    setActionLoading(id);
    try {
      await requestApi.respond(id, response);
      addToast({
        title: response === 'accepted' ? 'Request accepted' : 'Request declined',
        message: response === 'accepted' ? 'You confirmed the car pool arrangement.' : 'The request has been declined.',
        type: response === 'accepted' ? 'success' : 'info',
      });
      refreshCounts();
      load();
    } catch (err) {
      addToast({
        title: 'Action failed',
        message: err.message || 'Could not update the request. Try again.',
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const cancel = async (id) => {
    setActionLoading(id);
    try {
      await requestApi.cancel(id);
      refreshCounts();
      load();
    } catch (err) {
      addToast({
        title: 'Cancel failed',
        message: err.message || 'Could not cancel the request. Try again.',
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const tabLabels = { pending: 'Needs Response', received: 'Received', sent: 'Sent' };

  return (
    <>
      <div className="page-header">
        <h1>Car Pool Requests</h1>
        <p>Review incoming requests and confirm arrangements with a clear yes or no.</p>
      </div>

      <div className="tabs">
        {['pending', 'received', 'sent'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-inline"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : requests.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/></svg>
          </div>
          <h3>No {tabLabels[tab].toLowerCase()} requests</h3>
          <p>{tab === 'pending' ? 'When someone sends you a request, it will appear here for your response.' : 'No requests in this category yet.'}</p>
        </div>
      ) : (
        <div className="request-list">
          {requests.map((req) => {
            const isIncoming = req.receiver_id === user?.id;
            const personName = isIncoming ? req.sender_name : req.receiver_name;
            const isPendingIncoming = req.status === 'pending' && isIncoming;

            return (
              <div
                key={req.id}
                className={`request-item ${isPendingIncoming ? 'pending-incoming' : ''}`}
              >
                <div className="request-item-header">
                  <div className="request-person">
                    <Avatar name={personName} size="md" />
                    <div>
                      <h3>{isIncoming ? req.sender_name : req.receiver_name}</h3>
                      <span>{isIncoming ? 'wants to carpool with you' : 'Request sent by you'}</span>
                    </div>
                  </div>
                  <span className={`badge badge-${req.status}`}>{req.status}</span>
                </div>

                {(req.commute_route_from || req.sender_route_from) && (
                  <div className="request-item-route">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    {req.commute_route_from
                      ? `${req.commute_route_from} → ${req.commute_route_to}`
                      : `${req.sender_route_from} → ${req.sender_route_to}`}
                  </div>
                )}

                {req.message && (
                  <div className="request-item-message">&ldquo;{req.message}&rdquo;</div>
                )}

                <div className="request-item-meta">
                  {new Date(req.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>

                {isPendingIncoming && (
                  <div className="request-item-actions">
                    <button
                      className="btn btn-success"
                      onClick={() => respond(req.id, 'accepted')}
                      disabled={actionLoading === req.id}
                    >
                      ✓ Yes, Accept
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => respond(req.id, 'declined')}
                      disabled={actionLoading === req.id}
                    >
                      ✕ No, Decline
                    </button>
                  </div>
                )}

                {req.status === 'pending' && req.sender_id === user?.id && (
                  <div className="request-item-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => cancel(req.id)} disabled={actionLoading === req.id}>
                      Cancel Request
                    </button>
                  </div>
                )}

                {req.status !== 'pending' && (
                  <div className="status-timeline">
                    <span className="status-timeline-dot active" />
                    {req.status === 'accepted' ? 'Car pool confirmed' : 'Request closed'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
