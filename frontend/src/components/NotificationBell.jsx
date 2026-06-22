import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../services/api';
import './NotificationBell.css';

export default function NotificationBell() {
  const { unreadCount, setUnreadCount } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = async () => {
    if (!open) {
      setLoading(true);
      try {
        const res = await notificationApi.getAll();
        setNotifications(res.notifications.slice(0, 6));
      } catch {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }
    setOpen(!open);
  };

  const handleNotifClick = async (notif) => {
    if (!notif.is_read) {
      await notificationApi.markRead(notif.id);
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    navigate(notif.type === 'carpool_request' ? '/requests' : '/notifications');
  };

  const markAllRead = async () => {
    await notificationApi.markAllRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  return (
    <div className="notif-bell" ref={ref}>
      <button className="notif-bell-btn" onClick={toggle} aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          {loading ? (
            <div className="notif-dropdown-loading"><div className="spinner" /></div>
          ) : notifications.length === 0 ? (
            <p className="notif-dropdown-empty">No notifications yet</p>
          ) : (
            <ul className="notif-dropdown-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    className={`notif-dropdown-item ${!n.is_read ? 'unread' : ''}`}
                    onClick={() => handleNotifClick(n)}
                  >
                    <strong>{n.title}</strong>
                    <span>{n.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button className="notif-dropdown-footer" onClick={() => { setOpen(false); navigate('/notifications'); }}>
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
