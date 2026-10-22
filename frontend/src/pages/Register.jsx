import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Info,
} from 'lucide-react';
import './pages.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);

    try {
      await register(name, email, password);
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
      </div>

      {/* Main Container */}
      <div className="auth-card-wrapper wide animate-fade-in">
        <div className="surface-card" style={{ padding: '36px 32px' }}>
          {/* Header */}
          <div className="auth-card-header">
            <h1 className="auth-card-title">
              Candidate Enrollment
            </h1>
            <p className="auth-card-subtitle">
              Register your identity with the examination database.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="auth-alert-error">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Render Free Tier Cold-Start Notice */}
          <div className="auth-alert-info">
            <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Please wait a moment — since we are hosted on a free tier, the server may take around 50–90 seconds to wake up for the first request. Thank you for your patience!
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="register-name">Full Legal Name</label>
              <input
                id="register-name"
                className="form-input"
                type="text"
                placeholder="e.g. Eleanor Vance"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-email">Institutional Email</label>
              <input
                id="register-email"
                className="form-input"
                type="email"
                placeholder="candidate@institution.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-password">Password</label>
              <div className="input-wrapper">
                <input
                  id="register-password"
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" htmlFor="register-confirm">Confirm Password</label>
              <input
                id="register-confirm"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px' }}
              disabled={submitting}
            >
              {submitting ? 'Creating Candidate Record...' : 'Complete Enrollment'}
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
            <span>Already enrolled?</span>
            <Link to="/login" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              Sign In →
            </Link>
          </div>
        </div>
      </div>
      <div />
    </div>
  );
}
