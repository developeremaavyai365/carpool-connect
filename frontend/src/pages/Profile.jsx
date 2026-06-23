import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { employeeApi } from '../services/api';
import { saveStoredAutofill } from '../utils/userAutofill';
import { formStateFromUser, buildProfilePayload, profileSummary } from '../utils/profileFormUtils';
import Avatar from '../components/Avatar';
import { ThemeSelector } from '../components/ThemeToggle';
import './Profile.css';

const TABS = [
  { id: 'about', label: 'About you' },
  { id: 'account', label: 'Account' },
];

function applyProfileResponse(res, { updateUser, setForm, setCompletion, setVerification }) {
  updateUser(res.employee, {
    profileCompletion: res.profileCompletion,
    verification: res.verification,
  });
  saveStoredAutofill(res.employee);
  setForm(formStateFromUser(res.employee));
  if (res.profileCompletion) setCompletion(res.profileCompletion);
  if (res.verification) setVerification(res.verification);
}

export default function Profile() {
  const {
    user,
    updateUser,
    refreshProfile,
    profileCompletion: ctxCompletion,
    verification: ctxVerification,
    logout,
    loading: authLoading,
  } = useAuth();
  const { addToast } = useToast();

  const [tab, setTab] = useState('about');
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [verification, setVerification] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isSavingRef = useRef(false);
  const fetchGenRef = useRef(0);

  const summary = useMemo(() => profileSummary(user), [user]);

  useEffect(() => {
    employeeApi.getCities().then(({ cities: c }) => setCities(c)).catch(() => {});
  }, []);

  // Keep form in sync when auth user loads or changes.
  useEffect(() => {
    if (authLoading || !user) return;
    setForm((prev) => prev ?? formStateFromUser(user));
    if (ctxCompletion) setCompletion(ctxCompletion);
    if (ctxVerification?.length) setVerification(ctxVerification);
  }, [authLoading, user, ctxCompletion, ctxVerification]);

  // Refresh profile from server (StrictMode-safe — no "load once" ref guard).
  useEffect(() => {
    if (authLoading || !user?.id) return;

    const gen = ++fetchGenRef.current;
    let cancelled = false;

    const load = async () => {
      setRefreshing(true);
      try {
        const res = await refreshProfile();
        if (cancelled || gen !== fetchGenRef.current || isSavingRef.current || !res) return;
        applyProfileResponse(res, { updateUser, setForm, setCompletion, setVerification });
        setError('');
      } catch {
        /* Auth session already includes profile fields — no error banner needed */
      } finally {
        if (!cancelled && gen === fetchGenRef.current) setRefreshing(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, refreshProfile, updateUser]);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const updateVehicle = (field) => (e) =>
    setForm((prev) => ({ ...prev, vehicle: { ...(prev?.vehicle || {}), [field]: e.target.value } }));

  const cityOptions = useMemo(() => {
    const list = [...cities];
    const current = form?.city || user?.city;
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  }, [cities, form?.city, user?.city]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    isSavingRef.current = true;

    try {
      const payload = buildProfilePayload(form);
      if (!/^[6-9]\d{9}$/.test(payload.phone)) {
        setError('Enter a valid 10-digit Indian mobile number');
        return;
      }
      if (payload.name.length < 2) {
        setError('Name must be at least 2 characters');
        return;
      }

      const res = await employeeApi.updateProfile(payload);
      applyProfileResponse(res, { updateUser, setForm, setCompletion, setVerification });
      addToast({ title: 'Profile updated', message: 'Your information has been saved.', type: 'success' });
      setTab('about');
    } catch (err) {
      setError(err.message || err.data?.errors?.[0]?.msg || 'Update failed');
    } finally {
      isSavingRef.current = false;
      setLoading(false);
    }
  };

  if (authLoading || !user || !form) {
    return (
      <div className="loading-inline profile-loading">
        <div className="spinner" style={{ margin: '0 auto' }} />
        <p>Loading your profile…</p>
      </div>
    );
  }

  const memberLevel = completion?.memberLevel || 'New member';
  const completed = completion?.completed ?? 0;
  const total = completion?.total ?? 6;

  return (
    <div className="profile-app">
      <div className="profile-tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`profile-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`profile-panel ${tab === 'about' ? 'active' : ''}`} hidden={tab !== 'about'}>
        <div className="profile-about">
          {refreshing && (
            <p className="profile-refresh-hint" aria-live="polite">Syncing latest profile…</p>
          )}

          <button type="button" className="profile-identity" onClick={() => setTab('account')}>
            <div className="profile-avatar-wrap">
              <Avatar name={summary.name || user?.name} size="xl" />
              {user?.email_verified && (
                <span className="profile-verified-badge" aria-label="Verified">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </span>
              )}
            </div>
            <div className="profile-identity-text">
              <strong>{summary.name || user?.name}</strong>
              <span>{memberLevel}</span>
              {user?.email && <span className="profile-identity-email">{user.email}</span>}
            </div>
            <span className="profile-identity-chevron" aria-hidden="true">›</span>
          </button>

          {completion && completed < total && (
            <div className="profile-completion-card">
              <h3>Complete your profile</h3>
              <p>This builds trust and helps fellow travelers feel comfortable carpooling with you.</p>
              <div className="profile-completion-bar" aria-hidden="true">
                {Array.from({ length: total }).map((_, i) => (
                  <span key={i} className={i < completed ? 'filled' : ''} />
                ))}
              </div>
              <p className="profile-completion-count">{completed} out of {total} complete</p>
              {completion.nextStep && (
                <button type="button" className="profile-completion-link" onClick={() => setTab('account')}>
                  {completion.nextStep}
                </button>
              )}
            </div>
          )}

          {verification.length > 0 && (
            <section className="profile-section">
              <h3>You have a verified profile</h3>
              <ul className="profile-verified-list">
                {verification.map((item) => (
                  <li key={item.key}>
                    <span className="profile-check-icon" aria-hidden="true">✓</span>
                    <span>{item.key === 'email' ? item.value : item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="profile-section">
            <h3>Home address</h3>
            {user.home_address ? (
              <div className="profile-summary-card">
                <p className="profile-summary-bio">{user.home_address}</p>
                <button type="button" className="profile-summary-edit" onClick={() => setTab('account')}>
                  Edit address
                </button>
              </div>
            ) : (
              <button type="button" className="profile-action-row" onClick={() => setTab('account')}>
                <span className="profile-action-plus">+</span>
                Add your home address
              </button>
            )}
          </section>

          <section className="profile-section">
            <h3>Commute route</h3>
            {summary.route ? (
              <div className="profile-summary-card">
                <p className="profile-summary-route">{summary.route}</p>
                {summary.city && (
                  <p className="profile-summary-meta">{summary.city} · {summary.availability}</p>
                )}
              </div>
            ) : (
              <button type="button" className="profile-action-row" onClick={() => setTab('account')}>
                <span className="profile-action-plus">+</span>
                Add your commute route
              </button>
            )}
          </section>

          <section className="profile-section">
            <h3>About you</h3>
            {summary.bio ? (
              <div className="profile-summary-card">
                <p className="profile-summary-bio">{summary.bio}</p>
                <button type="button" className="profile-summary-edit" onClick={() => setTab('account')}>
                  Edit mini bio
                </button>
              </div>
            ) : (
              <button type="button" className="profile-action-row" onClick={() => setTab('account')}>
                <span className="profile-action-plus">+</span>
                Add a mini bio
              </button>
            )}
            {summary.travel_preferences ? (
              <div className="profile-summary-card profile-summary-card-spaced">
                <p className="profile-summary-label">Travel preferences</p>
                <p className="profile-summary-bio">{summary.travel_preferences}</p>
              </div>
            ) : (
              <button type="button" className="profile-action-row" onClick={() => setTab('account')}>
                <span className="profile-action-plus">+</span>
                Add travel preferences
              </button>
            )}
          </section>

          <section className="profile-section">
            <h3>Vehicle</h3>
            {summary.vehicle ? (
              <div className="profile-summary-card">
                <p className="profile-summary-bio">{summary.vehicle}</p>
                <button type="button" className="profile-summary-edit" onClick={() => setTab('account')}>
                  Edit vehicle
                </button>
              </div>
            ) : (
              <button type="button" className="profile-action-row" onClick={() => setTab('account')}>
                <span className="profile-action-plus">+</span>
                Add vehicle
              </button>
            )}
          </section>
        </div>
      </div>

      <div className={`profile-panel ${tab === 'account' ? 'active' : ''}`} hidden={tab !== 'account'}>
        <div className="profile-account">
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit} autoComplete="on">
            <div className="settings-card settings-card-inline">
              <p className="settings-card-title">Settings</p>
              <h3 className="settings-card-heading">Appearance</h3>
              <ThemeSelector />
            </div>

            <div className="profile-section-title">Personal details</div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Full name</label>
                <input id="name" name="name" value={form.name || ''} onChange={update('name')} required />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone || ''}
                  onChange={update('phone')}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="home_address">Home address</label>
              <textarea
                id="home_address"
                name="home_address"
                rows={2}
                value={form.home_address || ''}
                onChange={update('home_address')}
                placeholder="Your residential address"
              />
            </div>

            <div className="form-group">
              <label htmlFor="bio">Mini bio</label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                value={form.bio || ''}
                onChange={update('bio')}
                placeholder="Tell fellow travelers a bit about yourself…"
                maxLength={500}
                aria-describedby="bio-count"
              />
            </div>

            <div className="form-group">
              <label htmlFor="travel_preferences">Travel preferences</label>
              <textarea
                id="travel_preferences"
                name="travel_preferences"
                rows={2}
                value={form.travel_preferences || ''}
                onChange={update('travel_preferences')}
                placeholder="Music, AC, timing preferences…"
                maxLength={300}
              />
            </div>

            <div className="profile-section-title">Commute route</div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="route_from">Pickup from</label>
                <input id="route_from" value={form.route_from || ''} onChange={update('route_from')} />
              </div>
              <div className="form-group">
                <label htmlFor="route_to">Drop location</label>
                <input id="route_to" value={form.route_to || ''} onChange={update('route_to')} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city">City</label>
                <select id="city" value={form.city || ''} onChange={update('city')} required>
                  {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="availability-select">Availability</label>
                <select
                  id="availability-select"
                  value={form.availability || 'available'}
                  onChange={update('availability')}
                >
                  <option value="available">Available</option>
                  <option value="limited">Limited</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
            </div>

            <div className="form-group settings-toggle-row">
              <label htmlFor="email-notifications">
                <input
                  id="email-notifications"
                  type="checkbox"
                  checked={form.email_notifications !== false}
                  onChange={(e) => setForm((prev) => ({ ...prev, email_notifications: e.target.checked }))}
                />
                Receive Gmail alerts for carpool requests and updates
              </label>
            </div>

            <div className="profile-section-title">Vehicle</div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="vehicle-make">Make</label>
                <input
                  id="vehicle-make"
                  value={form.vehicle?.make || ''}
                  onChange={updateVehicle('make')}
                  placeholder="e.g. Maruti"
                />
              </div>
              <div className="form-group">
                <label htmlFor="vehicle-model">Model</label>
                <input
                  id="vehicle-model"
                  value={form.vehicle?.model || ''}
                  onChange={updateVehicle('model')}
                  placeholder="e.g. Swift"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="vehicle-color">Color</label>
                <input id="vehicle-color" value={form.vehicle?.color || ''} onChange={updateVehicle('color')} placeholder="e.g. White" />
              </div>
              <div className="form-group">
                <label htmlFor="vehicle-plate">Number plate</label>
                <input
                  id="vehicle-plate"
                  value={form.vehicle?.plate || ''}
                  onChange={updateVehicle('plate')}
                  placeholder="e.g. KA01AB1234"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="vehicle-seats">Seats</label>
                <input
                  id="vehicle-seats"
                  type="number"
                  min="1"
                  max="8"
                  value={form.vehicle?.seats || ''}
                  onChange={updateVehicle('seats')}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>

            <button
              type="button"
              className="btn btn-danger btn-block profile-signout-btn"
              onClick={logout}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
