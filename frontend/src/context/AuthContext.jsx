import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi, employeeApi, notificationApi, requestApi, setUnauthorizedHandler } from '../services/api';
import { connectRealtime, disconnectRealtime } from '../services/realtime';
import { notifyIncoming } from '../services/notifications';
import { syncUserToAutofill, saveStoredAutofill } from '../utils/userAutofill';
import { resetUiAfterLogout } from '../utils/resetUiState';

const AuthContext = createContext(null);

async function fetchSessionUser() {
  const data = await authApi.me();
  if (data.profileCompletion != null) return data;
  try {
    return await employeeApi.getProfile();
  } catch {
    return data;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profileCompletion, setProfileCompletion] = useState(null);
  const [verification, setVerification] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCommuteCount, setCompletedCommuteCount] = useState(0);

  const applySession = useCallback((data) => {
    if (data?.employee) {
      setUser(data.employee);
      syncUserToAutofill(data.employee);
    }
    if (data?.profileCompletion) setProfileCompletion(data.profileCompletion);
    if (data?.verification) setVerification(data.verification);
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const [notifRes, pendingRes, completedRes] = await Promise.all([
        notificationApi.getUnreadCount(),
        requestApi.getPending(),
        requestApi.getCompletedCount(),
      ]);
      setUnreadCount(notifRes.count);
      setPendingCount(pendingRes.requests.length);
      setCompletedCommuteCount(completedRes.count);
    } catch {
      /* ignore */
    }
  }, []);

  const connectUserRealtime = useCallback((token, userId) => {
    connectRealtime(
      token,
      userId,
      (notification) => {
        setUnreadCount((c) => c + 1);
        if (notification.type === 'carpool_request') {
          setPendingCount((c) => c + 1);
        }
        if (notification.type === 'carpool_response') {
          refreshCounts();
        }
        notifyIncoming(notification);
      },
      () => refreshCounts(),
    );
  }, [refreshCounts]);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data = await fetchSessionUser();
      applySession(data);
      const realtimeToken = localStorage.getItem('supabaseToken') || token;
      connectUserRealtime(realtimeToken, data.employee?.id);
      await refreshCounts();
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('supabaseToken');
      disconnectRealtime();
    } finally {
      setLoading(false);
    }
  }, [applySession, connectUserRealtime, refreshCounts]);

  useEffect(() => {
    loadUser();
    setUnauthorizedHandler(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('supabaseToken');
      disconnectRealtime();
      resetUiAfterLogout();
      setUser(null);
      setProfileCompletion(null);
      setVerification([]);
      setUnreadCount(0);
      setPendingCount(0);
      setCompletedCommuteCount(0);
    });
    return () => {
      setUnauthorizedHandler(null);
      disconnectRealtime();
    };
  }, [loadUser]);

  const completeSession = useCallback(async (token, employee, extra = {}) => {
    localStorage.setItem('token', token);
    if (extra.supabaseToken) {
      localStorage.setItem('supabaseToken', extra.supabaseToken);
    } else {
      localStorage.removeItem('supabaseToken');
    }
    applySession({ employee, ...extra });
    const realtimeToken = extra.supabaseToken || localStorage.getItem('supabaseToken') || token;
    connectUserRealtime(realtimeToken, employee?.id);
    await refreshCounts();
    return employee;
  }, [applySession, connectUserRealtime, refreshCounts]);

  const login = async (email, password) => {
    const { token, employee, supabaseToken } = await authApi.login({
      email: email.trim().toLowerCase(),
      password,
    });
    saveStoredAutofill({ email: email.trim().toLowerCase() });
    let extra = { supabaseToken };
    try {
      extra = { ...extra, ...(await employeeApi.getProfile()) };
    } catch {
      /* login response already has core profile fields */
    }
    return completeSession(token, extra.employee || employee, extra);
  };

  const register = async (data) => {
    const { token, employee, supabaseToken } = await authApi.register(data);
    let extra = { supabaseToken };
    try {
      extra = { ...extra, ...(await employeeApi.getProfile()) };
    } catch {
      /* ignore */
    }
    return completeSession(token, extra.employee || employee, extra);
  };

  const resetPassword = async ({ email, code, password }) => {
    const { token, employee, supabaseToken } = await authApi.resetPassword({
      email: email.trim().toLowerCase(),
      code,
      password,
    });
    saveStoredAutofill({ email: email.trim().toLowerCase() });
    return completeSession(token, employee, { supabaseToken });
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('supabaseToken');
    disconnectRealtime();
    resetUiAfterLogout();
    setUser(null);
    setProfileCompletion(null);
    setVerification([]);
    setUnreadCount(0);
    setPendingCount(0);
    setCompletedCommuteCount(0);
  }, []);

  const updateUser = useCallback((employee, meta = {}) => {
    setUser(employee);
    syncUserToAutofill(employee);
    if (meta.profileCompletion) setProfileCompletion(meta.profileCompletion);
    if (meta.verification) setVerification(meta.verification);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await employeeApi.getProfile();
      applySession(data);
      return data;
    } catch {
      return null;
    }
  }, [applySession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        resetPassword,
        logout,
        updateUser,
        refreshProfile,
        profileCompletion,
        verification,
        unreadCount,
        setUnreadCount,
        pendingCount,
        setPendingCount,
        completedCommuteCount,
        refreshCounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
