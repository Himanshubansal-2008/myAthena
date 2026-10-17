import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Camera,
  Maximize2,
  ArrowRight,
  ArrowLeft,
  X,
  FileText,
  Lock,
} from 'lucide-react';
import './pages.css';

const DEFAULT_SAMPLE_QUESTIONS = [
  {
    id: 1,
    prompt: 'In a distributed systems environment, which theorem states that it is impossible for a distributed data store to simultaneously provide more than two out of Consistency, Availability, and Partition Tolerance?',
    options: [
      'CAP Theorem (Brewer\'s Theorem)',
      'Byzantine Generals Theorem',
      'Amdahl\'s Law',
      'Nyquist-Shannon Sampling Theorem',
    ],
  },
  {
    id: 2,
    prompt: 'Which protocol operates at the Transport Layer of the OSI Model and provides connectionless, best-effort message delivery without transmission guarantees?',
    options: [
      'Transmission Control Protocol (TCP)',
      'User Datagram Protocol (UDP)',
      'Internet Control Message Protocol (ICMP)',
      'Border Gateway Protocol (BGP)',
    ],
  },
  {
    id: 3,
    prompt: 'What consensus algorithm is specifically designed to achieve leader election and log replication consistency across fault-tolerant distributed clusters with high understandability?',
    options: [
      'Raft Consensus Algorithm',
      'Dijkstra\'s Shortest Path Algorithm',
      'Bellman-Ford Distance Vector Algorithm',
      'Diffie-Hellman Key Exchange',
    ],
  },
  {
    id: 4,
    prompt: 'When a TLS/SSL session handshake occurs, which cryptographic mechanism is primarily utilized to establish the shared symmetric session key securely across an untrusted network?',
    options: [
      'Asymmetric Public Key Encryption / Diffie-Hellman',
      'Simple XOR Cipher Masking',
      'Cyclic Redundancy Check (CRC-32)',
      'HMAC-SHA256 Token Signing',
    ],
  },
];

export default function ExamRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const exam = location.state?.exam;

  // --- Exam Session State ---
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState((exam?.durationMinutes || 90) * 60);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showLogDrawer, setShowLogDrawer] = useState(false);

  // --- Proctoring & Security Flag State ---
  // incidents: array of { id, type, label, timestamp, formattedTime }
  const [incidents, setIncidents] = useState([]);
  const [activeWarning, setActiveWarning] = useState(null); // Active modal dialog
  const lastIncidentTimeRef = useRef(0);

  // --- Camera PiP Monitor ---
  const pipVideoRef = useRef(null);
  const pipStreamRef = useRef(null);

  // Stop camera tracks cleanly
  const cleanupCamera = useCallback(() => {
    if (pipStreamRef.current) {
      pipStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Error stopping pip video track:', e);
        }
      });
      pipStreamRef.current = null;
    }
    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = null;
    }
  }, []);

  // Initialize Corner Camera Feed
  useEffect(() => {
    let isMounted = true;

    async function initCornerCamera() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
          audio: false,
        });
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        pipStreamRef.current = stream;
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = stream;
          pipVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn('PiP Camera initialization skipped or unavailable:', err);
      }
    }

    initCornerCamera();

    return () => {
      isMounted = false;
      cleanupCamera();
    };
  }, [cleanupCamera]);

  // Unified, Debounced Proctoring Incident Dispatcher
  const recordProctoringIncident = useCallback((eventType, label) => {
    const now = Date.now();
    // Guard: Prevent double-counting when visibilitychange and window blur fire simultaneously
    if (now - lastIncidentTimeRef.current < 1500) {
      return;
    }
    lastIncidentTimeRef.current = now;

    const newIncident = {
      id: `incident-${now}`,
      type: eventType,
      label,
      timestamp: new Date().toISOString(),
      formattedTime: new Date().toLocaleTimeString(),
    };

    setIncidents((prev) => {
      const updated = [...prev, newIncident];
      return updated;
    });

    setActiveWarning(newIncident);
  }, []);

  // Proctoring Event Listeners (Page Visibility, Window Blur, Electron Bridge, Fullscreen Exit)
  useEffect(() => {
    // 1. Page Visibility API (detects tab switching & window minimize)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordProctoringIncident(
          'TAB_SWITCH_OR_MINIMIZE',
          'Window Minimized or Active Tab Switched'
        );
      }
    };

    // 2. Window Blur (detects clicking outside Athena into another application)
    const handleWindowBlur = () => {
      recordProctoringIncident(
        'WINDOW_BLUR',
        'Application Focus Lost (Navigated to Another Application)'
      );
    };

    // 3. Fullscreen Exit Detection
    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFull) {
        recordProctoringIncident(
          'FULLSCREEN_EXITED',
          'Exited Dedicated Full-Screen Mode'
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // 4. Secure Electron IPC Bridge listener (if running inside Electron)
    let unsubscribeElectronBlur = null;
    if (window.electronAPI?.onWindowBlur) {
      unsubscribeElectronBlur = window.electronAPI.onWindowBlur(() => {
        recordProctoringIncident(
          'ELECTRON_DESKTOP_BLUR',
          'Electron Application Window Lost Focus'
        );
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      if (unsubscribeElectronBlur) {
        unsubscribeElectronBlur();
      }
    };
  }, [recordProctoringIncident]);

  // Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelectOption = (idx) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestionIndex]: idx,
    }));
  };

  const handleDismissWarning = () => {
    // Re-engage fullscreen if exited
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    setActiveWarning(null);
  };

  const handleFinishExam = () => {
    cleanupCamera();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate('/dashboard');
  };

  const questions = DEFAULT_SAMPLE_QUESTIONS;
  const currentQuestion = questions[currentQuestionIndex];
  const incidentCount = incidents.length;

  return (
    <div className="exam-room-root">
      {/* Top Proctored Exam Header */}
      <header className="exam-room-topbar">
        <div className="exam-room-topbar-inner">
          {/* Brand & Exam Title */}
          <div className="exam-title-box">
            <div className="exam-shield-icon">
              <Shield size={16} />
            </div>
            <div>
              <div className="exam-main-title">
                {exam?.title || 'Advanced Computer Networks & Distributed Systems'}
              </div>
              <div className="exam-meta-sub">
                <span className="font-mono exam-code-tag">{exam?.code || 'CS-401'}</span>
                <span>• Live Proctored Assessment</span>
              </div>
            </div>
          </div>

          {/* Incident / Flag Counter Badge */}
          <div className="exam-proctor-badges">
            <button
              onClick={() => setShowLogDrawer(true)}
              className={`proctor-incident-pill ${incidentCount === 0 ? 'zero' : incidentCount === 1 ? 'warning' : 'critical'}`}
              title="Click to view proctoring incident log"
            >
              <AlertTriangle size={14} />
              <span>
                {incidentCount === 0
                  ? '0 Proctoring Flags'
                  : `${incidentCount} Flag${incidentCount > 1 ? 's' : ''} Recorded`}
              </span>
            </button>

            {/* Countdown Timer */}
            <div className="exam-timer-pill font-mono">
              <Clock size={15} />
              <span>{formatTimer(timeLeft)}</span>
            </div>

            {/* Finish Action */}
            <button
              onClick={() => setShowExitConfirm(true)}
              className="btn btn-secondary btn-sm"
            >
              Finish Exam
            </button>
          </div>
        </div>
      </header>

      {/* Main Examination Viewport */}
      <main className="exam-room-main">
        {/* Left Side: Question Navigation & Live PiP Camera */}
        <aside className="exam-room-sidebar">
          {/* Live PiP Webcam Feed Widget */}
          <div className="proctor-pip-card surface-card">
            <div className="proctor-pip-header">
              <div className="pip-status-dot" />
              <span className="pip-title">Live Candidate Feed</span>
            </div>
            <div className="proctor-pip-viewport">
              <video
                ref={pipVideoRef}
                autoPlay
                playsInline
                muted
                className="proctor-pip-video"
              />
              <div className="pip-overlay-badge">
                <Camera size={11} />
                <span>Monitoring Active</span>
              </div>
            </div>
          </div>

          {/* Question Palette */}
          <div className="question-palette-card surface-card">
            <h3 className="palette-title">Question Palette</h3>
            <div className="palette-grid">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentQuestionIndex;
                const isAnswered = selectedAnswers[idx] !== undefined;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={`palette-btn font-mono ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="palette-legend">
              <div className="legend-item">
                <span className="legend-dot answered" />
                <span>Answered</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot current" />
                <span>Current</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot unanswered" />
                <span>Unattempted</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center / Right: Question Content */}
        <div className="exam-question-area">
          <div className="surface-card question-display-card animate-fade-in">
            {/* Question Header */}
            <div className="question-header-row">
              <span className="question-number-pill">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
              <span className="question-points-pill">+2.0 / -0.50 Pts</span>
            </div>

            {/* Prompt Text */}
            <h2 className="question-prompt-text">{currentQuestion.prompt}</h2>

            {/* Options List */}
            <div className="question-options-stack">
              {currentQuestion.options.map((opt, optIdx) => {
                const isSelected = selectedAnswers[currentQuestionIndex] === optIdx;

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelectOption(optIdx)}
                    className={`option-choice-btn ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="option-radio-indicator">
                      {isSelected ? <Check size={13} /> : null}
                    </div>
                    <span className="option-text">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Navigation Actions */}
            <div className="question-footer-row">
              <button
                onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="btn btn-secondary"
              >
                <ArrowLeft size={14} />
                <span>Previous</span>
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                {currentQuestionIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                    className="btn btn-primary"
                  >
                    <span>Next Question</span>
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowExitConfirm(true)}
                    className="btn btn-primary"
                  >
                    <span>Review & Submit</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* =========================================================================
          PROCTORING WARNING MODAL DIALOG (Triggered upon observable incident)
         ========================================================================= */}
      {activeWarning && (
        <div className="proctor-warning-overlay animate-fade-in" role="alertdialog">
          <div className="surface-card proctor-warning-modal">
            <div className="proctor-warning-icon-wrapper">
              <AlertTriangle size={36} color="#ef4444" />
            </div>

            <div className="proctor-warning-badge-tag">
              PROCTORING INTEGRITY WARNING #{incidentCount}
            </div>

            <h2 className="proctor-warning-title">
              Assessment Window Focus Loss Detected
            </h2>

            <p className="proctor-warning-desc">
              Athena has flagged an integrity infraction during your active examination session. Navigating away, minimizing the window, or switching tabs is strictly forbidden under institutional rules.
            </p>

            {/* Incident Audit Details */}
            <div className="proctor-incident-details-box font-mono">
              <div className="incident-detail-row">
                <span className="detail-key">Infraction Type:</span>
                <span className="detail-value alert-red">{activeWarning.label}</span>
              </div>
              <div className="incident-detail-row">
                <span className="detail-key">Timestamp:</span>
                <span className="detail-value">{activeWarning.formattedTime} ({activeWarning.timestamp})</span>
              </div>
              <div className="incident-detail-row">
                <span className="detail-key">Total Flags:</span>
                <span className="detail-value font-bold">{incidentCount} / 3 Allowed</span>
              </div>
            </div>

            <p className="proctor-warning-footer-note">
              This incident has been logged with your candidate telemetry. Continuing infractions will result in automatic exam lock.
            </p>

            <button
              onClick={handleDismissWarning}
              className="btn btn-primary proctor-warning-ack-btn"
            >
              <span>I Understand & Resume Examination</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Finish / Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="modal-overlay">
          <div className="surface-card modal-content-card animate-fade-in">
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f3f5f8', marginBottom: '8px' }}>
              Confirm Assessment Submission
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              You have answered {Object.keys(selectedAnswers).length} of {questions.length} questions. Are you sure you want to conclude your session and return to the dashboard?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowExitConfirm(false)} className="btn btn-secondary">
                Continue Testing
              </button>
              <button onClick={handleFinishExam} className="btn btn-primary">
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring Incident Log Drawer */}
      {showLogDrawer && (
        <div className="proctor-drawer-overlay" onClick={() => setShowLogDrawer(false)}>
          <div className="proctor-drawer surface-card animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} color="#a5b4fc" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f3f5f8' }}>
                  Proctoring Audit Log
                </h3>
              </div>
              <button
                onClick={() => setShowLogDrawer(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {incidents.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 12px' }} />
                  No security incidents or window blur events recorded. Perfect integrity score.
                </div>
              ) : (
                <div className="incident-log-list">
                  {incidents.map((inc, i) => (
                    <div key={inc.id} className="incident-log-item">
                      <div className="log-item-header">
                        <span className="log-item-tag font-mono">Flag #{i + 1}</span>
                        <span className="log-item-time font-mono">{inc.formattedTime}</span>
                      </div>
                      <div className="log-item-label">{inc.label}</div>
                      <div className="log-item-iso font-mono">{inc.timestamp}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
