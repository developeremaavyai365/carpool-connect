import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../services/api';
import { onNotificationReceived } from '../services/realtime';
import './Notifications.css';

function isUnread(notif) {
  return notif?.is_read === 0 || notif?.is_read === false || !notif?.is_read;
}

function NotifIcon({ type, title }) {
  const isRequest = type === 'carpool_request';
  const isAccepted = title?.includes('Accepted');
  const cls = isRequest ? 'request' : isAccepted ? 'response' : 'default';

  return (
    <div className={`notification-icon-wrap ${cls}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {isRequest ? (
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        ) : (
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" />
        )}
      </svg>
    </div>
  );
}

export default function Notifications() {
  const { setUnreadCount, refreshCounts } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await notificationApi.getAll();
      const list = res.notifications || [];
      setNotifications(list);
      const unread = list.filter(isUnread).length;
      setUnreadCount(unread);
      refreshCounts().catch(() => {});
    } catch (err) {
      setNotifications([]);
      setError(err.message || 'Could not load your inbox. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount, refreshCounts]);

  useEffect(() => {
    if (pathname === '/notifications') {
      load();
    }
  }, [pathname, load]);

  useEffect(() => {
    return onNotificationReceived(() => {
      if (pathname === '/notifications') load();
    });
  }, [pathname, load]);

  useEffect(() => {
    const onFocus = () => {
      if (pathname === '/notifications') load();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [pathname, load]);

  const markRead = async (id) => {
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* keep UI usable */
    }
  };

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      setError('Could not mark all as read. Try again.');
    }
  };

  const handleClick = (notif) => {
    if (isUnread(notif)) markRead(notif.id);
    if (notif.type === 'carpool_request' || notif.type === 'carpool_response') {
      navigate('/requests');
    }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!feedbackFor) return;
    setFeedbackSending(true);
    try {
      await notificationApi.submitFeedback({
        notification_id: feedbackFor,
        rating: feedbackRating || undefined,
        comment: feedbackComment.trim() || undefined,
      });
      setFeedbackFor(null);
      setFeedbackRating(0);
      setFeedbackComment('');
    } catch {
      setError('Could not send feedback. Try again.');
    } finally {
      setFeedbackSending(false);
    }
  };

  const unread = notifications.filter(isUnread).length;

  return (
    <div className="inbox-page">
      <div className="page-header inbox-header">
        <div>
          <h1>Inbox</h1>
          <p>Updates when other riders send or respond to car pool requests.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm inbox-refresh-btn"
          onClick={load}
          disabled={loading}
          aria-label="Refresh inbox"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error inbox-error" role="alert">
          {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      <div className="notification-actions">
        <p><strong>{unread}</strong> unread notification{unread !== 1 ? 's' : ''}</p>
        {unread > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="loading-inline inbox-loading">
          <div className="spinner" style={{ margin: '0 auto' }} />
          <p>Loading your inbox…</p>
        </div>
      ) : notifications.length === 0 && !error ? (
        <div className="empty-state card inbox-empty">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3>All caught up</h3>
          <p>You will receive instant alerts here when someone sends or responds to a car pool request.</p>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              role="button"
              tabIndex={0}
              className={`notification-item ${isUnread(notif) ? 'unread' : ''}`}
              onClick={() => handleClick(notif)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(notif); }}
            >
              <NotifIcon type={notif.type} title={notif.title} />
              <div className="notification-content">
                <h4>{notif.title}</h4>
                <p>{notif.message}</p>
                <div className="notification-time">
                  {new Date(notif.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <button
                  type="button"
                  className="notification-feedback-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFeedbackFor(notif.id);
                    setFeedbackRating(0);
                    setFeedbackComment('');
                  }}
                >
                  Rate this alert
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {feedbackFor && (
        <div className="notification-feedback-panel card" onClick={(e) => e.stopPropagation()}>
          <h3>How helpful was this alert?</h3>
          <form onSubmit={submitFeedback}>
            <div className="feedback-stars" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`feedback-star ${feedbackRating >= n ? 'active' : ''}`}
                  onClick={() => setFeedbackRating(n)}
                  aria-label={`${n} stars`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              placeholder="Optional comment…"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
            />
            <div className="feedback-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFeedbackFor(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={feedbackSending}>
                {feedbackSending ? 'Sending…' : 'Submit feedback'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
