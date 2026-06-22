import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLocation } from '../context/LocationContext';
import LocationPicker from '../components/LocationPicker';
import MapPickerModal from '../components/MapPickerModal';
import RouteVisualizationMap from '../components/maps/RouteVisualizationMap';
import CommuteCard from '../components/CommuteCard';
import { useRouteLocations } from '../hooks/useRouteLocations';
import { commuteApi, ridesApi } from '../services/api';
import { filtersFromUser } from '../utils/userAutofill';
import { useRouteCalculator } from '../hooks/useRouteCalculator';
import { suggestStopovers } from '../utils/routeOptions';
import {
  WIZARD_STEPS, SMOKING_OPTIONS, MUSIC_OPTIONS, PETS_OPTIONS,
  emptyCommuteForm, commuteToForm, formatDeparture, formatPrice, labelFor,
  isDepartureInFuture, toLocalDateString, normalizeTimeHHMM,
} from '../utils/commuteLabels';
import { dedupeStopovers, isValidStopover, normalizeStopoverLabel } from '../utils/commuteFilters';
import { sortCommutesByCreated } from '../utils/commuteSort';
import './Publish.css';

const STEP_TITLES = {
  itinerary: 'Where are you going?',
  stopovers: 'Add stopovers to get more passengers',
  route: 'What is your route?',
  schedule: 'When are you leaving?',
  seats: 'Seats & price',
  preferences: 'Ride preferences',
  review: 'Review & publish',
};

const STEP_DESCS = {
  itinerary: 'Enter your departure and destination — other riders search by route.',
  stopovers: 'Optional stops along the way help you find more passengers.',
  route: 'Pick the path you will drive. Passengers see this on your listing.',
  schedule: 'Pick the date and time passengers should be ready.',
  seats: 'How many seats are free, and what do you charge per passenger?',
  preferences: 'Help passengers know what to expect on the ride.',
  review: 'Check everything before your commute goes live.',
};

function PreferenceGroup({ label, options, value, onChange }) {
  return (
    <div className="publish-pref-group">
      <span className="publish-pref-label">{label}</span>
      <div className="publish-pref-options">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`publish-pref-btn ${value === opt.value ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <span className="publish-pref-icon" aria-hidden="true">{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RouteFlowPreview({ from, stopovers, to }) {
  const points = [from, ...stopovers, to].filter((p) => p?.trim());
  if (points.length < 2) return null;

  return (
    <div className="publish-flow-route-preview" aria-label="Route preview">
      {points.map((place, index) => (
        <div key={`${place}-${index}`} className="publish-flow-route-preview-row">
          {index > 0 && <span className="publish-flow-route-preview-arrow" aria-hidden="true">↓</span>}
          <span className="publish-flow-route-preview-point">{place}</span>
        </div>
      ))}
    </div>
  );
}

function StepContent({
  stepId,
  routeFrom,
  routeTo,
  form,
  patchForm,
  openPicker,
  routeOptions,
  routesLoading,
  routesSource,
  routesError,
  onRetryRoutes,
  selectedRoute,
  fromCoords,
  toCoords,
  stopoverCoords,
  alternativePolylines,
  tollPreference,
  setTollPreference,
  stopoverSuggestions,
  toggleStopoverSuggestion,
  addCustomStopover,
  moveStopover,
  removeStopover,
  editStopover,
  matchingRadiusKm = 50,
}) {
  switch (stepId) {
    case 'itinerary':
      return (
        <div className="publish-flow-route-fields">
          <button type="button" className="publish-flow-route-row" onClick={() => openPicker('from')}>
            <span className="publish-flow-dot from" />
            <span>
              <span className="publish-flow-route-label">Leaving from</span>
              <span className="publish-flow-route-value">{routeFrom || 'Enter pickup point'}</span>
            </span>
          </button>
          <button type="button" className="publish-flow-route-row" onClick={() => openPicker('to')}>
            <span className="publish-flow-dot to" />
            <span>
              <span className="publish-flow-route-label">Going to</span>
              <span className="publish-flow-route-value">{routeTo || 'Enter destination'}</span>
            </span>
          </button>
        </div>
      );

    case 'route':
      return (
        <>
          <RouteFlowPreview from={routeFrom} stopovers={form.stopovers} to={routeTo} />

          {selectedRoute && (
            <dl className="publish-flow-route-stats">
              <div><dt>Distance</dt><dd>{selectedRoute.distance_label}</dd></div>
              <div><dt>Duration</dt><dd>{selectedRoute.duration_label}</dd></div>
              {selectedRoute.eta && (
                <div><dt>ETA</dt><dd>{formatDeparture(selectedRoute.eta)}</dd></div>
              )}
              <div><dt>Fuel est.</dt><dd>₹{selectedRoute.fuel_estimate_inr}</dd></div>
              {selectedRoute.hasTolls && (
                <div><dt>Toll est.</dt><dd>₹{selectedRoute.toll_cost_inr}</dd></div>
              )}
            </dl>
          )}

          <div className="publish-flow-toll-tabs" role="tablist" aria-label="Toll preference">
            {[
              { id: 'all', label: 'All routes' },
              { id: 'with_tolls', label: 'With tolls' },
              { id: 'without_tolls', label: 'Without tolls' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tollPreference === id}
                className={`publish-flow-toll-tab ${tollPreference === id ? 'active' : ''}`}
                onClick={() => setTollPreference(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="publish-flow-coverage-hint">
            Passengers within {matchingRadiusKm} km of your route (source, stopovers, and destination) can discover and request this ride.
          </p>

          <div className="publish-flow-map">
            <RouteVisualizationMap
              fromCoords={fromCoords}
              toCoords={toCoords}
              stopoverCoords={stopoverCoords}
              stopoverLabels={form.stopovers}
              polyline={selectedRoute?.polyline}
              alternativePolylines={alternativePolylines}
              fromLabel={routeFrom}
              toLabel={routeTo}
              matchingRadiusKm={matchingRadiusKm}
              showCoverage
            />
          </div>

          {routesLoading ? (
            <div className="publish-flow-loading">
              <div className="spinner" />
              <span>Calculating route…</span>
            </div>
          ) : routesError ? (
            <div className="publish-flow-route-error">
              <p>{routesError}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetryRoutes}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <p className="publish-flow-routes-source">
                Live routes via {routesSource === 'ors' ? 'OpenRouteService' : routesSource === 'osrm' ? 'OSRM' : 'routing engine'}
              </p>
              <div className="publish-flow-route-options" role="radiogroup" aria-label="Route options">
                {routeOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`publish-flow-route-option ${form.selectedRouteId === opt.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="route-option"
                      value={opt.id}
                      checked={form.selectedRouteId === opt.id}
                      onChange={() => patchForm({ selectedRouteId: opt.id })}
                    />
                    <span className="publish-flow-route-radio" aria-hidden="true" />
                    <span className="publish-flow-route-copy">
                      <span className="publish-flow-route-summary">{opt.label || opt.summary}</span>
                      <span className="publish-flow-route-detail">{opt.summary} · {opt.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      );

    case 'stopovers':
      return (
        <>
          <RouteFlowPreview from={routeFrom} stopovers={form.stopovers} to={routeTo} />

          {form.stopovers.length > 0 && (
            <ul className="publish-flow-selected-stops">
              {form.stopovers.map((name, index) => (
                <li key={`${name}-${index}`} className="publish-flow-selected-stop">
                  <span className="publish-flow-selected-stop-label">{name}</span>
                  <div className="publish-flow-selected-stop-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => editStopover(index)} aria-label="Edit stopover">Edit</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveStopover(index, -1)} disabled={index === 0} aria-label="Move up">↑</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveStopover(index, 1)} disabled={index === form.stopovers.length - 1} aria-label="Move down">↓</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeStopover(index)} aria-label="Remove stopover">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {stopoverSuggestions.length > 0 && (
            <>
              <p className="publish-flow-stop-hint">Suggested stops along your route</p>
              <ul className="publish-flow-stop-list">
                {stopoverSuggestions.map((name) => (
                  <li key={name}>
                    <label className="publish-flow-stop-row">
                      <input
                        type="checkbox"
                        checked={form.stopovers.includes(name)}
                        onChange={() => toggleStopoverSuggestion(name)}
                      />
                      <span className="publish-flow-checkbox" aria-hidden="true" />
                      <span>{name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button type="button" className="publish-flow-add-city" onClick={addCustomStopover}>
            Add stopover
          </button>
        </>
      );

    case 'schedule':
      return (
        <div className="publish-flow-form-grid">
          <div className="form-group">
            <label htmlFor="departure-date">Date</label>
            <input
              id="departure-date"
              type="date"
              value={form.departure_date}
              min={toLocalDateString()}
              onChange={(e) => patchForm({ departure_date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="departure-time">Time</label>
            <input
              id="departure-time"
              type="time"
              value={form.departure_time}
              onChange={(e) => patchForm({ departure_time: normalizeTimeHHMM(e.target.value) })}
            />
          </div>
        </div>
      );

    case 'seats':
      return (
        <>
          <div className="publish-flow-seats-row">
            <span>Available seats</span>
            <div className="publish-flow-seats-control">
              <button type="button" onClick={() => patchForm({ seats_available: Math.max(1, form.seats_available - 1) })} aria-label="Decrease">−</button>
              <span>{form.seats_available}</span>
              <button type="button" onClick={() => patchForm({ seats_available: Math.min(6, form.seats_available + 1) })} aria-label="Increase">+</button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="price-seat">Price per seat (₹)</label>
            <input
              id="price-seat"
              type="number"
              min="0"
              step="10"
              value={form.price_per_seat}
              onChange={(e) => patchForm({ price_per_seat: e.target.value })}
              placeholder="0 for free"
            />
            <small className="form-hint">Set to 0 if you are not charging passengers.</small>
          </div>
        </>
      );

    case 'preferences':
      return (
        <>
          <PreferenceGroup label="Smoking" options={SMOKING_OPTIONS} value={form.smoking} onChange={(v) => patchForm({ smoking: v })} />
          <PreferenceGroup label="Music" options={MUSIC_OPTIONS} value={form.music} onChange={(v) => patchForm({ music: v })} />
          <PreferenceGroup label="Pets" options={PETS_OPTIONS} value={form.pets} onChange={(v) => patchForm({ pets: v })} />
          <div className="form-group">
            <label htmlFor="commute-notes">Additional information (optional)</label>
            <textarea
              id="commute-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => patchForm({ notes: e.target.value })}
              placeholder="Pickup details, luggage space, preferred meeting point…"
              maxLength={1000}
            />
          </div>
        </>
      );

    case 'review':
      return (
        <dl className="publish-flow-review">
          <div><dt>Route</dt><dd>{routeFrom} → {routeTo}</dd></div>
          {form.route_label && <div><dt>Path</dt><dd>{form.route_label} · {form.route_detail}</dd></div>}
          {form.stopovers.length > 0 && (
            <div className="full"><dt>Stopovers</dt><dd>{form.stopovers.join(', ')}</dd></div>
          )}
          <div><dt>When</dt><dd>{formatDeparture(`${form.departure_date}T${form.departure_time}:00`)}</dd></div>
          <div><dt>Seats</dt><dd>{form.seats_available}</dd></div>
          <div><dt>Price</dt><dd>{formatPrice(form.price_per_seat)}{form.price_per_seat > 0 ? ' / seat' : ''}</dd></div>
          <div><dt>Smoking</dt><dd>{labelFor(form.smoking, SMOKING_OPTIONS)}</dd></div>
          <div><dt>Music</dt><dd>{labelFor(form.music, MUSIC_OPTIONS)}</dd></div>
          <div><dt>Pets</dt><dd>{labelFor(form.pets, PETS_OPTIONS)}</dd></div>
          {form.notes && <div className="full"><dt>Notes</dt><dd>{form.notes}</dd></div>}
        </dl>
      );

    default:
      return null;
  }
}

export default function Publish() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('edit');
  const { user } = useAuth();
  const { addToast } = useToast();
  const { position } = useLocation();

  const [view, setView] = useState('wizard');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => emptyCommuteForm(user));
  const [myCommutes, setMyCommutes] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSegment, setPickerSegment] = useState('from');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSegment, setMapSegment] = useState('from');
  const [tollPreference, setTollPreference] = useState('all');
  const [matchingRadiusKm, setMatchingRadiusKm] = useState(50);

  useEffect(() => {
    ridesApi.matchingConfig()
      .then((cfg) => {
        if (cfg?.matching_radius_km) setMatchingRadiusKm(cfg.matching_radius_km);
      })
      .catch(() => {});
  }, []);

  const {
    routeFrom, routeTo, setFromManual, setToManual, applyMapLocation, syncFromInitial,
  } = useRouteLocations({ autoDetectFrom: false });

  const departureAtIso = form.departure_date && form.departure_time
    ? `${form.departure_date}T${normalizeTimeHHMM(form.departure_time)}:00`
    : null;

  const {
    routes: calculatedRoutes,
    waypoints,
    source: routesSource,
    loading: routesLoading,
    error: routesError,
    retry: retryRoutes,
  } = useRouteCalculator({
    routeFrom,
    routeTo,
    stopovers: form.stopovers,
    city: user?.city,
    departureAt: departureAtIso,
    enabled: Boolean(routeFrom?.trim() && routeTo?.trim()),
  });

  const filteredRouteOptions = useMemo(() => {
    if (tollPreference === 'with_tolls') {
      return calculatedRoutes.filter((r) => r.hasTolls);
    }
    if (tollPreference === 'without_tolls') {
      return calculatedRoutes.filter((r) => !r.hasTolls);
    }
    return calculatedRoutes;
  }, [calculatedRoutes, tollPreference]);

  const routeOptions = filteredRouteOptions.length ? filteredRouteOptions : calculatedRoutes;

  const mapCenter = position?.lat != null ? { lat: position.lat, lng: position.lng } : null;
  const isEditing = Boolean(editId);
  const currentStep = WIZARD_STEPS[step] || WIZARD_STEPS[0];
  const isLastStep = step === WIZARD_STEPS.length - 1;

  const selectedRoute = routeOptions.find((o) => o.id === form.selectedRouteId)
    || routeOptions.find((o) => o.id === 'recommended')
    || routeOptions[0];

  const stopoverSuggestions = useMemo(
    () => suggestStopovers(routeFrom, routeTo, form.stopovers)
      .filter((name) => !form.stopovers.includes(name)),
    [routeFrom, routeTo, form.stopovers],
  );

  const fromCoords = selectedRoute?.from || (waypoints[0] ? [waypoints[0].lat, waypoints[0].lng] : null);
  const toCoords = selectedRoute?.to || (waypoints.length ? [waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng] : null);
  const stopoverCoords = selectedRoute?.stopover_coords
    || waypoints.slice(1, -1).map((w) => [w.lat, w.lng]);

  const alternativePolylines = useMemo(
    () => routeOptions
      .filter((r) => r.id !== selectedRoute?.id && r.polyline?.length >= 2)
      .map((r) => r.polyline),
    [routeOptions, selectedRoute?.id],
  );

  const patchForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!calculatedRoutes.length) return;
    setForm((f) => {
      if (calculatedRoutes.some((r) => r.id === f.selectedRouteId)) return f;
      const preferred = calculatedRoutes.find((r) => r.id === 'recommended') || calculatedRoutes[0];
      return { ...f, selectedRouteId: preferred?.id || f.selectedRouteId };
    });
  }, [calculatedRoutes]);

  useEffect(() => {
    if (!user || editId) return;
    setForm(emptyCommuteForm(user));
  }, [user?.id, editId]);

  const loadMine = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await commuteApi.getMine();
      setMyCommutes(sortCommutesByCreated(res.commutes || []));
    } catch {
      setMyCommutes([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    syncFromInitial(filtersFromUser(user));
    loadMine();
  }, [user, syncFromInitial, loadMine]);

  useEffect(() => {
    if (!editId) return;
    commuteApi.getById(editId).then(({ commute }) => {
      const f = commuteToForm(commute);
      setForm(f);
      setFromManual(f.route_from);
      setToManual(f.route_to);
      setView('wizard');
      setStep(0);
    }).catch(() => {
      addToast({ title: 'Not found', message: 'Could not load commute to edit.', type: 'error' });
      setSearchParams({});
    });
  }, [editId, user, setFromManual, setToManual, setSearchParams, addToast]);

  useEffect(() => {
    patchForm({ route_from: routeFrom, route_to: routeTo });
  }, [routeFrom, routeTo]);

  useEffect(() => {
    if (!selectedRoute) return;
    patchForm({
      route_label: selectedRoute.label || selectedRoute.summary,
      route_detail: selectedRoute.detail,
    });
  }, [selectedRoute?.id, selectedRoute?.label, selectedRoute?.summary, selectedRoute?.detail]);

  const openPicker = (segment) => {
    setPickerSegment(segment);
    setPickerOpen(true);
  };

  const openMap = (segment) => {
    setMapSegment(segment);
    setMapOpen(true);
  };

  const toggleStopoverSuggestion = (name) => {
    setForm((f) => {
      const has = f.stopovers.includes(name);
      const next = has
        ? f.stopovers.filter((s) => s !== name)
        : dedupeStopovers([...f.stopovers, name]);
      return { ...f, stopovers: next };
    });
  };

  const addCustomStopover = () => {
    const city = window.prompt('Add a stopover city or area');
    if (!city?.trim()) return;
    const label = normalizeStopoverLabel(city);
    if (!isValidStopover(label)) {
      addToast({ title: 'Invalid stopover', message: 'Enter a location between 2 and 80 characters.', type: 'warning' });
      return;
    }
    if (form.stopovers.some((s) => s.toLowerCase() === label.toLowerCase())) {
      addToast({ title: 'Duplicate stopover', message: 'This stop is already on your route.', type: 'warning' });
      return;
    }
    patchForm({ stopovers: dedupeStopovers([...form.stopovers, label]) });
  };

  const removeStopover = (index) => {
    patchForm({ stopovers: form.stopovers.filter((_, i) => i !== index) });
  };

  const moveStopover = (index, direction) => {
    const next = [...form.stopovers];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patchForm({ stopovers: next });
  };

  const editStopover = (index) => {
    const current = form.stopovers[index];
    const updated = window.prompt('Edit stopover', current);
    if (!updated?.trim()) return;
    const label = normalizeStopoverLabel(updated);
    if (!isValidStopover(label)) {
      addToast({ title: 'Invalid stopover', message: 'Enter a location between 2 and 80 characters.', type: 'warning' });
      return;
    }
    if (form.stopovers.some((s, i) => i !== index && s.toLowerCase() === label.toLowerCase())) {
      addToast({ title: 'Duplicate stopover', message: 'This stop is already on your route.', type: 'warning' });
      return;
    }
    const next = [...form.stopovers];
    next[index] = label;
    patchForm({ stopovers: dedupeStopovers(next) });
  };

  const validateStep = (forPublish = false) => {
    const stepId = WIZARD_STEPS[step]?.id;
    const checkItinerary = forPublish || stepId === 'itinerary';
    const checkRoutePick = forPublish || stepId === 'route';
    const checkStopovers = forPublish || stepId === 'stopovers';
    const checkSchedule = forPublish || stepId === 'schedule';

    if (checkItinerary) {
      if (!routeFrom.trim() || !routeTo.trim()) {
        addToast({ title: 'Route required', message: 'Enter both departure and destination.', type: 'warning' });
        return false;
      }
    }
    if (checkStopovers) {
      const normalized = dedupeStopovers(form.stopovers || []);
      if (normalized.length !== (form.stopovers || []).length) {
        patchForm({ stopovers: normalized });
      }
    }
    if (checkRoutePick) {
      if (!selectedRoute) {
        addToast({ title: 'Route required', message: 'Choose a route to continue.', type: 'warning' });
        return false;
      }
    }
    if (checkSchedule) {
      if (!form.departure_date || !form.departure_time) {
        addToast({ title: 'Schedule required', message: 'Pick a date and time.', type: 'warning' });
        return false;
      }
      if (!isDepartureInFuture(form.departure_date, form.departure_time)) {
        addToast({
          title: 'Time in the past',
          message: 'Departure must be at least 1 minute from now. Choose a later time or tomorrow.',
          type: 'warning',
        });
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const publish = async () => {
    if (!validateStep(true)) return;
    setSaving(true);
    try {
      const departureTime = normalizeTimeHHMM(form.departure_time);
      const stopovers = dedupeStopovers(form.stopovers || []);
      const payload = {
        route_from: routeFrom.trim(),
        route_to: routeTo.trim(),
        pickup_address: routeFrom.trim(),
        destination_address: routeTo.trim(),
        departure_date: form.departure_date,
        departure_time: departureTime,
        seats_available: Number(form.seats_available) || 1,
        price_per_seat: Number(form.price_per_seat) || 0,
        notes: form.notes || '',
        stopovers,
        route_label: form.route_label || selectedRoute?.label || selectedRoute?.summary || '',
        route_detail: form.route_detail || selectedRoute?.detail || '',
        route_type: selectedRoute?.type || selectedRoute?.id || '',
        route_polyline: selectedRoute?.encoded_polyline || null,
        route_distance_m: selectedRoute?.distance_m ?? null,
        route_duration_s: selectedRoute?.duration_s ?? null,
        distance_km: selectedRoute?.distance_m != null ? selectedRoute.distance_m / 1000 : null,
        estimated_duration: selectedRoute?.duration_s ?? null,
        stopover_coords: selectedRoute?.stopover_coords || stopoverCoords || [],
        toll_info: selectedRoute ? {
          has_tolls: selectedRoute.hasTolls,
          toll_cost_inr: selectedRoute.toll_cost_inr,
          fuel_estimate_inr: selectedRoute.fuel_estimate_inr,
        } : {},
        smoking: form.smoking,
        music: form.music,
        pets: form.pets,
      };
      if (fromCoords?.length === 2) {
        payload.source_lat = fromCoords[0];
        payload.source_lng = fromCoords[1];
        payload.pickup_lat = fromCoords[0];
        payload.pickup_lng = fromCoords[1];
      }
      if (toCoords?.length === 2) {
        payload.dest_lat = toCoords[0];
        payload.dest_lng = toCoords[1];
        payload.destination_lat = toCoords[0];
        payload.destination_lng = toCoords[1];
      }
      if (isEditing) {
        await commuteApi.update(editId, payload);
        addToast({ title: 'Commute updated', message: 'Your listing has been saved.', type: 'success' });
        navigate('/my-commutes');
        return;
      } else {
        await commuteApi.create(payload);
        addToast({ title: 'Commute published', message: 'Passengers can now find and request a seat.', type: 'success' });
      }
      setSearchParams({});
      setForm(emptyCommuteForm(user));
      setStep(0);
      navigate('/my-commutes');
    } catch (err) {
      addToast({ title: 'Could not save', message: err.message || 'Try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const removeCommute = async (id) => {
    if (!window.confirm('Remove this published commute?')) return;
    try {
      await commuteApi.remove(id);
      addToast({ title: 'Removed', message: 'Commute listing deleted.', type: 'info' });
      loadMine();
    } catch (err) {
      addToast({ title: 'Could not remove', message: err.message, type: 'error' });
    }
  };

  const startNew = () => {
    setSearchParams({});
    setForm(emptyCommuteForm(user));
    setFromManual(user?.route_from || '');
    setToManual(user?.route_to || '');
    setStep(0);
    setView('wizard');
  };

  const startEdit = (commute) => {
    setSearchParams({ edit: String(commute.id) });
  };

  const continueDisabled = (currentStep.id === 'route' && ((routesLoading && !routeOptions.length) || routesError || !selectedRoute))
    || (isLastStep && saving);

  return (
    <div className={`publish-screen ${view === 'wizard' ? 'publish-screen-wizard-only' : ''}`}>
      {view === 'list' && (
        <>
          <header className="publish-header">
            <h1>Publish a commute</h1>
            <p>Offer seats on your route — share the drive and split costs with fellow travelers.</p>
          </header>

          <div className="publish-tabs">
            <button type="button" className="active" onClick={startNew}>Publish new</button>
            <button type="button" onClick={() => setView('list')}>
              My listings ({myCommutes.filter((c) => c.status === 'active').length})
            </button>
            <Link to="/my-commutes" className="publish-browse-link">My commutes</Link>
          </div>
        </>
      )}

      {view === 'list' && (
        <section className="publish-listings">
          {loadingList ? (
            <div className="loading-inline"><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : myCommutes.length === 0 ? (
            <div className="publish-empty card">
              <h3>No published commutes yet</h3>
              <p>Create your first listing so other riders can request a seat.</p>
              <button type="button" className="btn btn-primary" onClick={startNew}>Publish a commute</button>
            </div>
          ) : (
            <ul className="publish-listings-grid">
              {myCommutes.map((c) => (
                <li key={c.id} className="publish-listing-item card">
                  <CommuteCard commute={c} compact static />
                  <div className="publish-listing-actions">
                    {c.status === 'active' ? (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(c)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCommute(c.id)}>Delete</button>
                      </>
                    ) : (
                      <span className="badge badge-declined">{c.status}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === 'wizard' && (
        <>
          <header className="publish-header publish-header-wizard">
            <h1>Publish a commute</h1>
          </header>
          <article className="publish-flow-card card">
            <header className="publish-flow-card-head">
              <p className="publish-flow-step-count">Step {step + 1} of {WIZARD_STEPS.length}</p>
              <h2 className="publish-flow-title">{STEP_TITLES[currentStep.id]}</h2>
              <p className="publish-flow-desc">{STEP_DESCS[currentStep.id]}</p>
            </header>

            <div className="publish-flow-card-body">
              <StepContent
                stepId={currentStep.id}
                routeFrom={routeFrom}
                routeTo={routeTo}
                form={form}
                patchForm={patchForm}
                openPicker={openPicker}
                routeOptions={routeOptions}
                routesLoading={routesLoading}
                routesSource={routesSource}
                routesError={routesError}
                onRetryRoutes={retryRoutes}
                selectedRoute={selectedRoute}
                fromCoords={fromCoords}
                toCoords={toCoords}
                stopoverCoords={stopoverCoords}
                alternativePolylines={alternativePolylines}
                tollPreference={tollPreference}
                setTollPreference={setTollPreference}
                stopoverSuggestions={stopoverSuggestions}
                toggleStopoverSuggestion={toggleStopoverSuggestion}
                addCustomStopover={addCustomStopover}
                moveStopover={moveStopover}
                removeStopover={removeStopover}
                editStopover={editStopover}
                matchingRadiusKm={matchingRadiusKm}
              />
            </div>

            <footer className="publish-flow-card-foot">
              {step > 0 ? (
                <button type="button" className="btn btn-secondary" onClick={prevStep}>Back</button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => setView('list')}>Cancel</button>
              )}
              {!isLastStep ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={nextStep}
                  disabled={continueDisabled}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={publish}
                  disabled={continueDisabled}
                >
                  {saving ? 'Publishing…' : isEditing ? 'Save changes' : 'Publish commute'}
                </button>
              )}
            </footer>
          </article>
        </>
      )}

      <LocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        segment={pickerSegment}
        value={pickerSegment === 'from' ? routeFrom : routeTo}
        onSelect={(label) => {
          if (pickerSegment === 'from') setFromManual(label);
          else setToManual(label);
        }}
        recentItems={user?.recent_searches || []}
        mapCenter={mapCenter}
        onOpenMap={openMap}
      />

      <MapPickerModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        segment={mapSegment === 'to' ? 'drop' : 'from'}
        initialCenter={mapCenter}
        onConfirm={(result) => applyMapLocation(mapSegment, result.location)}
      />
    </div>
  );
}
