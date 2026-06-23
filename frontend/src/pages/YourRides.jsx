import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestApi } from '../services/api';
import Avatar from '../components/Avatar';
import './YourRides.css';

export default function YourRides() {
  const { user } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sent, received] = await Promise.all([
          requestApi.getAll('sent'),
          requestApi.getAll('received'),
        ]);
        const all = [...(sent.requests || []), ...(received.requests || [])]
          .filter((r) => r.status === 'accepted')
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        setRides(all);
      } catch {
        setRides([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="loading-inline">
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div className="rides-empty">
        <div className="rides-empty-art" aria-hidden="true">
          <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
            <ellipse cx="60" cy="72" rx="42" ry="18" fill="var(--color-primary-soft)" />
            <circle cx="60" cy="42" r="28" stroke="var(--color-accent)" strokeWidth="4" fill="none" />
            <path d="M72 54 L84 66" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" />
            <path d="M48 30 L44 22 M72 30 L76 22" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1>Your upcoming commutes will show up here</h1>
        <p>
          Search for colleagues on your route, or publish your commute so others can join you.
        </p>
        <div className="rides-empty-actions">
          <Link to="/dashboard" className="btn btn-primary">Search a ride</Link>
          <Link to="/publish" className="btn btn-secondary">Publish commute</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rides-page">
      <header className="rides-header">
        <h1>Your rides</h1>
        <p>{rides.length} confirmed commute{rides.length !== 1 ? 's' : ''}</p>
      </header>

      <ul className="rides-list">
        {rides.map((ride) => {
          const isIncoming = ride.receiver_id === user?.id;
          const partner = isIncoming ? ride.sender_name : ride.receiver_name;
          const v = ride.driver_vehicle;
          const vehicleStr = v
            ? [v.make, v.model, v.color, v.plate].filter(Boolean).join(' · ')
            : null;
          return (
            <li key={ride.id} className="rides-card">
              <div className="rides-card-top">
                <Avatar name={partner} size="md" />
                <div>
                  <strong>{partner}</strong>
                  <span>{isIncoming ? 'Carpooling with you' : 'You joined their pool'}</span>
                </div>
                <span className="badge badge-accepted">Confirmed</span>
              </div>
              {(ride.commute_route_from || ride.sender_route_from) && (
                <p className="rides-card-route">
                  {ride.commute_route_from || ride.sender_route_from} → {ride.commute_route_to || ride.sender_route_to}
                </p>
              )}
              {ride.commute_departure_at && (
                <time className="rides-card-time">
                  Departure: {new Date(ride.commute_departure_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              )}
              {!isIncoming && (ride.driver_phone || ride.driver_email || vehicleStr) && (
                <div className="rides-card-contact">
                  <p className="rides-card-contact-title">Driver contact details</p>
                  {ride.driver_phone && (
                    <a href={`tel:${ride.driver_phone}`} className="rides-card-contact-row">
                      <span>📞</span><span>{ride.driver_phone}</span>
                    </a>
                  )}
                  {ride.driver_email && (
                    <a href={`mailto:${ride.driver_email}`} className="rides-card-contact-row">
                      <span>📧</span><span>{ride.driver_email}</span>
                    </a>
                  )}
                  {vehicleStr && (
                    <div className="rides-card-contact-row">
                      <span>🚗</span><span>{vehicleStr}</span>
                    </div>
                  )}
                </div>
              )}
              <time className="rides-card-time" style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                Confirmed {new Date(ride.updated_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
