import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import SearchCard from '../components/SearchCard';
import { useRouteLocations } from '../hooks/useRouteLocations';
import { employeeApi, commuteApi } from '../services/api';
import { filtersFromUser, saveSearchFilters } from '../utils/userAutofill';
import './Dashboard.css';

function truncate(str, max = 48) {
  if (!str || str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { position } = useLocation();
  const [routeReady, setRouteReady] = useState(false);
  const [autoDetectFrom, setAutoDetectFrom] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [driverStats, setDriverStats] = useState(null);

  const {
    routeFrom,
    routeTo,
    setFromManual,
    setToManual,
    applyMapLocation,
    syncFromInitial,
  } = useRouteLocations({ autoDetectFrom });

  const mapCenter = position?.lat != null ? { lat: position.lat, lng: position.lng } : null;
  const firstName = user?.name?.split(' ')[0] || 'there';

  useEffect(() => {
    if (!user) return;
    const params = filtersFromUser(user);
    syncFromInitial(params);
    setAutoDetectFrom(!params.route_from);
    setRouteReady(true);
  }, [user, syncFromInitial]);

  useEffect(() => {
    employeeApi.getRecentSearches()
      .then(({ searches }) => setRecentSearches(searches || []))
      .catch(() => setRecentSearches(user?.recent_searches || []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    commuteApi.getMine()
      .then((res) => setDriverStats(res.stats || null))
      .catch(() => setDriverStats(null));
  }, [user]);

  const runSearch = async ({ travelDate }) => {
    if (!routeFrom.trim()) return;
    setSearching(true);
    try {
      const payload = {
        city: user?.city || '',
        route_from: routeFrom.trim(),
        route_to: routeTo.trim(),
        availability: user?.availability || '',
        travelDate,
      };
      saveSearchFilters(payload);
      await employeeApi.saveRecentSearch({
        route_from: payload.route_from,
        route_to: payload.route_to,
        city: payload.city,
      }).then(({ searches }) => {
        if (searches?.length) setRecentSearches(searches);
      }).catch(() => {});
      navigate('/browse-rides', {
        state: {
          route_from: payload.route_from,
          route_to: payload.route_to,
          date: travelDate === 'tomorrow'
            ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        },
      });
    } finally {
      setSearching(false);
    }
  };

  const applyRecent = (item) => {
    setFromManual(item.route_from || '');
    setToManual(item.route_to || '');
  };

  return (
    <div className="discover-screen">
      <header className="discover-hero">
        <div className="discover-brand-mark" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <p className="discover-greeting">Hello, {firstName}!</p>
        <h1 className="discover-headline">
          Commute smarter.<br />Share the journey.
        </h1>
      </header>

{driverStats && driverStats.total > 0 && (
        <section className="discover-driver-overview card" aria-labelledby="driver-overview-title">
          <div className="discover-driver-overview-head">
            <h2 id="driver-overview-title">Your published commutes</h2>
            <Link to="/my-commutes" className="btn btn-secondary btn-sm">Open My Commutes</Link>
          </div>
          <div className="discover-driver-stats">
            <span><strong>{driverStats.upcoming}</strong> upcoming</span>
            <span><strong>{driverStats.active}</strong> active</span>
            <span><strong>{driverStats.completed}</strong> completed</span>
            <span><strong>{driverStats.cancelled}</strong> cancelled</span>
          </div>
        </section>
      )}

      {routeReady && (
        <SearchCard
          routeFrom={routeFrom}
          routeTo={routeTo}
          onFromChange={setFromManual}
          onToChange={setToManual}
          onMapConfirm={(segment, location) => applyMapLocation(segment, location)}
          mapCenter={mapCenter}
          recentSearches={recentSearches}
          onSearch={runSearch}
          searching={searching}
          submitLabel="Browse rides"
        />
      )}

      {recentSearches.length > 0 && (
        <section className="discover-recent" aria-labelledby="recent-searches-title">
          <h2 id="recent-searches-title">Recent searches</h2>
          <ul className="discover-recent-list">
            {recentSearches.map((item, i) => (
              <li key={`${item.route_from}-${item.route_to}-${i}`}>
                <button type="button" className="discover-recent-item" onClick={() => applyRecent(item)}>
                  <span className="discover-recent-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <span className="discover-recent-text">
                    <strong>{truncate(item.route_from)}</strong>
                    {item.route_to && <small>{truncate(item.route_to)}</small>}
                  </span>
                  <span className="discover-recent-chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
