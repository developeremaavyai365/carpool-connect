import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { locationApi } from '../services/api';

const LIBRARIES = ['places', 'geometry'];

const GoogleMapsContext = createContext({
  ready: false,
  apiKey: null,
  config: null,
  loadError: null,
});

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

function GoogleMapsLoader({ apiKey, config, children }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'carpool-google-maps',
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  const value = useMemo(() => ({
    ready: Boolean(isLoaded && window.google?.maps),
    apiKey,
    config,
    loadError: loadError?.message || null,
  }), [apiKey, config, isLoaded, loadError]);

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function GoogleMapsProvider({ children }) {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [config, setConfig] = useState(null);
  const [configReady, setConfigReady] = useState(Boolean(envKey));

  useEffect(() => {
    let cancelled = false;
    locationApi.mapsConfig()
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setConfigReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const apiKey = envKey || (config?.maps_js_api_key || '').trim();

  const offlineValue = useMemo(() => ({
    ready: false,
    apiKey: apiKey || null,
    config,
    loadError: configReady && !apiKey
      ? 'Google Maps API key not configured. Add VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_BROWSER_KEY on the server.'
      : null,
  }), [apiKey, config, configReady]);

  if (!configReady) {
    return (
      <GoogleMapsContext.Provider value={offlineValue}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  if (!apiKey) {
    return (
      <GoogleMapsContext.Provider value={offlineValue}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return (
    <GoogleMapsLoader apiKey={apiKey} config={config}>
      {children}
    </GoogleMapsLoader>
  );
}
