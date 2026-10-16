import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import './pages.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const isDesktop = Boolean(window.electronAPI?.isElectron);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Top Bar */}
      <div className="auth-nav-bar">
        <div className="auth-brand-badge">
          <div className="auth-brand-icon">
            <Shield size={16} />
          </div>
          <span className="auth-brand-text">
            ATHENA <span>// ASSESSMENT</span>
          </span>
        </div>

        <div>
          {isDesktop ? (
            <div className="status-pill status-emerald">
              <span className="status-dot"></span>
              Desktop Runtime Active (Electron 29)
            </div>
          ) : (
            <div className="status-pill status-amber">
              <span className="status-dot"></span>
              Web Browser Client
            </div>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="auth-card-wrapper animate-fade-in">
        <div className="surface-card" style={{ padding: '36px 32px' }}>
          {/* Header */}
          <div className="auth-card-header">
            <h1 className="auth-card-title">
              Candidate Sign In
            </h1>
            <p className="auth-card-subtitle">
              Authenticate to access scheduled proctored evaluations.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="auth-alert-error">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email-input">Institutional Email</label>
              <input
                id="email-input"
                className="form-input"
                type="email"
                placeholder="name@institution.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="password-input">Password</label>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Forgot password? Contact owner
                </span>
              </div>
              <div className="input-wrapper">
                <input
                  id="password-input"
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="input-icon-btn"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px' }}
              disabled={submitting}
            >
              {submitting ? 'Verifying Session...' : 'Authenticate & Enter Portal'}
              {!submitting && <ArrowRight size={15} />}
            </button>
          </form>

          {/* Switch link */}
          <div style={{
            marginTop: '24px',
            paddingTop: '18px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '12.5px',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>New candidate?</span>
            <Link to="/register" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              Create Account →
            </Link>
          </div>
        </div>
      </div>
      <div />
    </div>
  );
}
