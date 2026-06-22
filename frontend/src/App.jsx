import { useEffect } from 'react';

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

    <div key="app-shell">

      <AppRoutes />

    </div>

  );

}

