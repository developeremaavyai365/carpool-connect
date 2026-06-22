import { useEffect, useState } from 'react';
import { platformApi } from '../services/api';
import './PlatformShowcase.css';

function formatStat(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

const CARDS = [
  { key: 'members', label: 'Members', hint: 'Registered on the platform' },
  { key: 'active_rides', label: 'Active rides', hint: 'Published commutes open now' },
  { key: 'seats_available', label: 'Seats available', hint: 'Open seats on active routes' },
  { key: 'carpools_matched', label: 'Carpools matched', hint: 'Accepted ride requests' },
];

export default function PlatformShowcase({ variant = 'default', className = '' }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    platformApi.getStats()
      .then(({ stats: data }) => {
        if (!cancelled) setStats(data || null);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section
      className={`platform-showcase platform-showcase-${variant} ${className}`.trim()}
      aria-label="Platform statistics"
    >
      {variant === 'default' && (
        <header className="platform-showcase-head">
          <h2>Platform at a glance</h2>
          <p>Live counts from Carpool Connect</p>
        </header>
      )}

      <div className="platform-showcase-grid">
        {CARDS.map(({ key, label, hint }) => (
          <article key={key} className="platform-showcase-card">
            <strong className="platform-showcase-value">
              {loading ? '—' : formatStat(stats?.[key])}
            </strong>
            <span className="platform-showcase-label">{label}</span>
            {variant === 'default' && (
              <span className="platform-showcase-hint">{hint}</span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
