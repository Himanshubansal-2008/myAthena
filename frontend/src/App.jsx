import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ExamInstructions from './pages/ExamInstructions.jsx';
import { Shield, ArrowRight, ArrowLeft } from 'lucide-react';
import './index.css';
import './pages/pages.css';

function ProtectedRoute({ children }) {
  const { user, token, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
          }}>
            <Shield size={20} />
          </div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
            Loading Athena Assessment Session...
          </div>
        </div>
      </div>
    );
  }

  if (!token && !user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { user, token, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

/**
 * Placeholder component for the next preparation step (/system-check).
 * Ensures smooth transition without blank screen or crash in Day 2 Commit 1.
 */
function SystemCheckPlaceholder() {
  const navigate = useNavigate();
  const location = useLocation();
  const exam = location.state?.exam;

  return (
    <div className="placeholder-page">
      <div className="surface-card placeholder-card animate-fade-in">
        <div className="placeholder-icon-badge">
          <Shield size={28} />
        </div>
        <div>
          <div className="status-pill status-indigo" style={{ marginBottom: 12 }}>
            Stage 2 • Hardware Readiness (Upcoming in Commit 2)
          </div>
          <h1 className="placeholder-title">System Diagnostics & Environment Readiness</h1>
          <p className="placeholder-desc">
            You have successfully completed Stage 1 (Exam Instructions & Rules Undertaking) and navigated to the <code>/system-check</code> route. Automated hardware diagnostics (webcam, microphone, and desktop full-screen integrity checks) will be activated in the next commit.
          </p>
        </div>

        {exam && (
          <div className="placeholder-info-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target Assessment:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {exam.title} ({exam.code})
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Duration & Scope:</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {exam.durationMinutes} Minutes • {exam.totalQuestions} Questions • {exam.maxMarks || exam.totalMarks} Marks
              </span>
            </div>
          </div>
        )}

        <div className="placeholder-actions">
          <button
            onClick={() => navigate('/instructions', { state: { exam } })}
            className="btn btn-secondary"
          >
            <ArrowLeft size={14} />
            <span>Back to Instructions</span>
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-primary"
          >
            <span>Return to Dashboard</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructions"
            element={
              <ProtectedRoute>
                <ExamInstructions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exam-instructions"
            element={
              <ProtectedRoute>
                <ExamInstructions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/system-check"
            element={
              <ProtectedRoute>
                <SystemCheckPlaceholder />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

