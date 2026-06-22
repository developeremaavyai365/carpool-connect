import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

/** Compact icon toggle for header / auth pages */
export function ThemeToggleIcon({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className={`theme-toggle-icon ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Full appearance picker for Profile settings */
export function ThemeSelector() {
  const { preference, setTheme } = useTheme();
  const options = [
    { id: 'light', label: 'Light', desc: 'Clean and bright' },
    { id: 'dark', label: 'Dark', desc: 'Easy on the eyes' },
    { id: 'system', label: 'System', desc: 'Match your device' },
  ];

  return (
    <div className="theme-selector" role="radiogroup" aria-label="Appearance">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={preference === opt.id}
          className={`theme-selector-option ${preference === opt.id ? 'active' : ''}`}
          onClick={() => setTheme(opt.id)}
        >
          <span className={`theme-selector-preview theme-preview-${opt.id}`} aria-hidden="true" />
          <span className="theme-selector-copy">
            <strong>{opt.label}</strong>
            <small>{opt.desc}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
