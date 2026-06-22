import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { registerFormDefaults, saveStoredAutofill } from '../utils/userAutofill';
import OtpInput from '../components/OtpInput';
import { ThemeToggleIcon } from '../components/ThemeToggle';
import PlatformShowcase from '../components/PlatformShowcase';
import './Auth.css';
import '../components/OtpInput.css';

function readPasswordFields(formEl) {
  if (!formEl) return { password: '', confirmPassword: '' };
  const password = formEl.elements.namedItem('password')?.value || '';
  const confirmPassword = formEl.elements.namedItem('confirmPassword')?.value || '';
  return { password, confirmPassword };
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('details');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form, setForm] = useState(() => registerFormDefaults());

  useEffect(() => {
    saveStoredAutofill({
      name: form.name,
      email: form.email,
      phone: form.phone,
    });
  }, [form.name, form.email, form.phone]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const update = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const validateDetails = (formEl) => {
    const { password, confirmPassword } = readPasswordFields(formEl);
    const pwd = password || form.password;
    const confirm = confirmPassword || form.confirmPassword;

    if (pwd.length < 6) {
      setError('Password must be at least 6 characters');
      return null;
    }
    if (pwd !== confirm) {
      setError('Passwords do not match');
      return null;
    }
    setForm((prev) => ({ ...prev, password: pwd, confirmPassword: confirm }));
    return pwd;
  };

  const requestOtp = async () => {
    const normalizedEmail = form.email.trim().toLowerCase();
    const res = await authApi.sendOtp({
      channel: 'email',
      identifier: normalizedEmail,
      purpose: 'register',
    });
    setEmailSent(Boolean(res.emailSent));
    setDevOtp(res.devOtp || '');
    setInfo(res.message);
    setStep('verify');
    setCountdown(60);
    return res;
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    const password = validateDetails(e.currentTarget);
    if (!password) return;

    setLoading(true);
    try {
      await requestOtp();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);
    try {
      await requestOtp();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        channel: 'email',
        code: otp,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || err.data?.errors?.[0]?.msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <h2>Join the carpool community</h2>
        <p>Register with your details and verify your email with a one-time code.</p>
        <PlatformShowcase variant="auth" />
      </div>

      <div className="auth-form-side">
        <div className="auth-theme-float">
          <ThemeToggleIcon />
        </div>
        <div className="auth-card wide">
          <div className="auth-header">
            <div className="auth-logo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2" />
              </svg>
            </div>
            <h1>Create account</h1>
            <p>{step === 'details' ? 'Step 1: Your details' : 'Step 2: Verify email'}</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {info && step === 'verify' && <div className="alert alert-success">{info}</div>}
          {devOtp && step === 'verify' && !emailSent && (
            <div className="otp-dev-hint">Development code: <strong>{devOtp}</strong></div>
          )}

          {step === 'details' && (
            <form onSubmit={sendOtp} autoComplete="on" method="post">
              <div className="form-group">
                <label htmlFor="reg-name">Full Name</label>
                <input
                  id="reg-name"
                  name="name"
                  value={form.name}
                  onChange={update('name')}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-phone">Phone Number</label>
                <input
                  id="reg-phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  required
                  pattern="[6-9][0-9]{9}"
                  placeholder="10-digit mobile number"
                  autoComplete="tel"
                  inputMode="tel"
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  required
                  placeholder="you@gmail.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="reg-password">Password</label>
                  <input
                    id="reg-password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={update('password')}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-confirm">Confirm Password</label>
                  <input
                    id="reg-confirm"
                    name="confirmPassword"
                    type="password"
                    value={form.confirmPassword}
                    onChange={update('confirmPassword')}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="auth-hint">You can add your commute route later in Profile.</p>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? 'Sending code...' : 'Send verification code'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={completeRegistration}>
              <p className="otp-step-text">
                {emailSent
                  ? <>Check your email inbox at <strong>{form.email}</strong> and enter the 6-digit code.</>
                  : <>Enter the verification code for <strong>{form.email}</strong></>}
              </p>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              <button type="submit" className="btn btn-primary btn-block" disabled={loading || otp.length < 6}>
                {loading ? 'Creating account...' : 'Verify & Register'}
              </button>
              <div className="otp-resend">
                {countdown > 0 ? (
                  <span>Resend in {countdown}s</span>
                ) : (
                  <button type="button" onClick={resendOtp}>Resend code</button>
                )}
                {' · '}
                <button type="button" onClick={() => { setStep('details'); setOtp(''); setInfo(''); setDevOtp(''); }}>
                  ← Back to details
                </button>
              </div>
            </form>
          )}

          <div className="auth-footer">
            Already registered? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
