import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { setNotificationHandler } from '../services/notifications';
import ToastContainer from './ToastContainer';

export default function NotificationBridge() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setNotificationHandler((notification) => {
      const type = notification.type === 'carpool_response'
        ? (notification.title?.includes('Accepted') ? 'success' : 'info')
        : 'request';

      addToast({
        title: notification.title,
        message: notification.message,
        type,
        action: {
          label: notification.type === 'carpool_request' ? 'Review request →' : 'View details →',
          onClick: () => navigate(notification.type === 'carpool_request' ? '/requests' : '/notifications'),
        },
      });
    });
    return () => setNotificationHandler(null);
  }, [addToast, navigate]);

  return <ToastContainer />;
}
