import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { loginFormDefaults, saveStoredAutofill } from '../utils/userAutofill';
import OtpInput from '../components/OtpInput';
import { ThemeToggleIcon } from '../components/ThemeToggle';
import PlatformShowcase from '../components/PlatformShowcase';
import './Auth.css';
import '../components/OtpInput.css';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(() => location.state?.email || loginFormDefaults().email);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Enter your registered email address');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.sendOtp({
        channel: 'email',
        identifier: normalized,
        purpose: 'reset',
      });
      setEmail(normalized);
      setEmailSent(Boolean(res.emailSent));
      setDevOtp(res.devOtp || '');
      setInfo(res.message);
      setStep('verify');
      setCountdown(60);
      setOtp('');
    } catch (err) {
      if (err.isTimeout) {
        // Supabase likely sent the email before the server timed out.
        // Advance to verify so the user can enter the code they received.
        setEmail(normalized);
        setEmailSent(true);
        setInfo('Check your email — a verification code may have been sent. Enter it below.');
        setStep('verify');
        setCountdown(60);
        setOtp('');
      } else {
        setError(err.message || 'Could not send reset code');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (otp.length !== 6) {
      setError('Enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        email: email.trim().toLowerCase(),
        code: otp,
        password,
      });
      saveStoredAutofill({ email: email.trim().toLowerCase() });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <h2>Reset your password</h2>
        <p>We will send a verification code to your registered email address.</p>
        <PlatformShowcase variant="auth" />
      </div>

      <div className="auth-form-side">
        <div className="auth-theme-float">
          <ThemeToggleIcon />
        </div>
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2" />
              </svg>
            </div>
            <h1>Forgot Password</h1>
            <p>{step === 'email' ? 'Step 1: Enter your email' : 'Step 2: Verify code & set new password'}</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {info && step === 'verify' && <div className="alert alert-success">{info}</div>}
          {devOtp && step === 'verify' && !emailSent && (
            <div className="otp-dev-hint">Development code: <strong>{devOtp}</strong></div>
          )}

          {step === 'email' && (
            <form onSubmit={sendCode} autoComplete="on">
              <div className="form-group">
                <label htmlFor="forgot-email">Registered email</label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
                {loading ? 'Sending code...' : 'Send reset code'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleReset} autoComplete="on">
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} readOnly />
              </div>
              <p className="otp-step-text">
                {emailSent
                  ? <>Enter the 6-digit code sent to <strong>{email}</strong></>
                  : <>Enter the verification code for <strong>{email}</strong></>}
              </p>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="forgot-password">New password</label>
                <input
                  id="forgot-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="forgot-confirm">Confirm new password</label>
                <input
                  id="forgot-confirm"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={loading || otp.length < 6}
              >
                {loading ? 'Updating password...' : 'Reset Password & Sign In'}
              </button>
              <div className="otp-resend">
                {countdown > 0 ? (
                  <span>Resend in {countdown}s</span>
                ) : (
                  <button type="button" onClick={sendCode} disabled={loading}>
                    Resend code
                  </button>
                )}
                {' · '}
                <button type="button" onClick={() => { setStep('email'); setOtp(''); setInfo(''); setDevOtp(''); }}>
                  Change email
                </button>
              </div>
            </form>
          )}

          <div className="auth-footer">
            <Link to="/login">← Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
