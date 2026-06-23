import { useEffect, Component } from 'react';

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './context/AuthContext';

import Layout from './components/Layout';

import { LocationProvider } from './context/LocationContext';

import Login from './pages/Login';

import Register from './pages/Register';

import ForgotPassword from './pages/ForgotPassword';

import Dashboard from './pages/Dashboard';

import Profile from './pages/Profile';

import Requests from './pages/Requests';

import Notifications from './pages/Notifications';

import LiveLocation from './pages/LiveLocation';

import YourRides from './pages/YourRides';

import Publish from './pages/Publish';
import DriverDashboard from './pages/DriverDashboard';
import BrowseCommutes from './pages/BrowseCommutes';

import { resetUiAfterLogout } from './utils/resetUiState';



class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: '1rem', opacity: 0.4 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>An unexpected error occurred. Please reload the page.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingScreen() {

  return (

    <div className="loading-screen">

      <div className="spinner" />

    </div>

  );

}



/** Wraps login/register so the page is always visible after sign-out. */

function AuthPageShell({ children }) {

  const location = useLocation();



  useEffect(() => {

    resetUiAfterLogout();

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

  }, [location.pathname]);



  return <div className="auth-route-root">{children}</div>;

}



function AuthRoutes() {

  return (

    <Routes>

      <Route path="/login" element={<AuthPageShell><Login /></AuthPageShell>} />

      <Route path="/register" element={<AuthPageShell><Register /></AuthPageShell>} />

      <Route path="/forgot-password" element={<AuthPageShell><ForgotPassword /></AuthPageShell>} />

      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>

  );

}



function AppRoutes() {

  return (

    <LocationProvider>

      <Layout>

        <Routes>

          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/browse-rides" element={<BrowseCommutes />} />
          <Route path="/commutes" element={<Navigate to="/browse-rides" replace />} />

          <Route path="/my-commutes" element={<DriverDashboard />} />

          <Route path="/publish-commute" element={<Publish />} />
          <Route path="/publish" element={<Navigate to="/publish-commute" replace />} />

          <Route path="/rides" element={<YourRides />} />

          <Route path="/live-location" element={<LiveLocation />} />

          <Route path="/profile" element={<Profile />} />

          <Route path="/requests" element={<Requests />} />

          <Route path="/notifications" element={<Notifications />} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>

      </Layout>

    </LocationProvider>

  );

}



export default function App() {

  const { user, loading } = useAuth();



  useEffect(() => {

    if (!loading && !user) {

      resetUiAfterLogout();

    }

  }, [user, loading]);



  if (loading) {

    return <LoadingScreen />;

  }



  if (!user) {

    return (

      <div key="auth-shell" className="auth-route-root">

        <AuthRoutes />

      </div>

    );

  }



  return (

    <ErrorBoundary>

      <div key="app-shell">

        <AppRoutes />

      </div>

    </ErrorBoundary>

  );

}

