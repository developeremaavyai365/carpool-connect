import { useState, useRef } from 'react';

import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

import { loginFormDefaults, saveStoredAutofill } from '../utils/userAutofill';

import { ThemeToggleIcon } from '../components/ThemeToggle';

import './Auth.css';



function readLoginFields(form) {

  if (!form) {

    return { email: '', password: '' };

  }

  const emailEl = form.elements.namedItem('email');

  const passwordEl = form.elements.namedItem('password');

  const email = (emailEl?.value || '').trim().toLowerCase();

  const password = passwordEl?.value || '';

  return { email, password };

}



export default function Login() {

  const { login } = useAuth();

  const navigate = useNavigate();

  const formRef = useRef(null);

  const [email, setEmail] = useState(() => loginFormDefaults().email);

  const [password, setPassword] = useState('');

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);



  const handleSubmit = async (e) => {

    e.preventDefault();

    setError('');

    setLoading(true);



    const { email: formEmail, password: formPassword } = readLoginFields(formRef.current);

    const normalized = formEmail || email.trim().toLowerCase();

    const pwd = formPassword || password;



    if (!normalized || !pwd) {

      setError('Please enter both email and password');

      setLoading(false);

      return;

    }



    setEmail(normalized);

    setPassword(pwd);



    try {

      await login(normalized, pwd);

      saveStoredAutofill({ email: normalized });

      navigate('/dashboard');

    } catch (err) {
      const hint = err.data?.hint;
      setError(hint ? `${err.message} ${hint}` : (err.message || 'Invalid email or password'));
    } finally {

      setLoading(false);

    }

  };



  return (

    <div className="auth-page">




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

            <h1>Sign In</h1>

            <p>Enter your email and password</p>

          </div>



          {error && <div className="alert alert-error">{error}</div>}



          <form ref={formRef} onSubmit={handleSubmit} autoComplete="on" method="post">

            <div className="form-group">

              <label htmlFor="login-email">Email</label>

              <input

                id="login-email"

                name="email"

                type="email"

                value={email}

                onChange={(e) => setEmail(e.target.value)}

                placeholder="you@company.com"

                autoComplete="username"

                inputMode="email"

                required

              />

            </div>

            <div className="form-group">

              <label htmlFor="login-password">Password</label>

              <input

                id="login-password"

                name="password"

                type="password"

                value={password}

                onChange={(e) => setPassword(e.target.value)}

                placeholder="Enter your password"

                autoComplete="current-password"

                required

              />

            </div>

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>

              {loading ? 'Signing in...' : 'Sign In'}

            </button>

            <p className="auth-hint" style={{ marginTop: '1rem', textAlign: 'center' }}>

              <Link to="/forgot-password" state={{ email: email.trim().toLowerCase() }} className="btn btn-ghost btn-sm">

                Forgot password? Reset via email

              </Link>

            </p>

          </form>



          <div className="auth-footer">

            New here? <Link to="/register">Create an account</Link>

          </div>

        </div>

      </div>

    </div>

  );

}


