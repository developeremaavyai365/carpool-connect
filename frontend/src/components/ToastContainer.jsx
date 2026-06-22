import { useToast } from '../context/ToastContext';
import './ToastContainer.css';

const ICONS = {
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  success: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" />
    </svg>
  ),
  request: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2" />
    </svg>
  ),
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
          <div className="toast-icon">{ICONS[toast.type] || ICONS.info}</div>
          <div className="toast-body">
            <strong>{toast.title}</strong>
            {toast.message && <p>{toast.message}</p>}
            {toast.action && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.action.onClick?.();
                  removeToast(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
