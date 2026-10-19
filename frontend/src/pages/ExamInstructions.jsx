import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  Clock,
  FileText,
  Award,
  CheckCircle2,
  AlertTriangle,
  Check,
  Ban,
  ArrowLeft,
  ArrowRight,
  Info,
  CheckSquare,
  Square,
  Lock,
} from 'lucide-react';
import './pages.css';

const DEFAULT_EXAM_DATA = {
  id: 'cs-401',
  code: 'CS-401',
  title: 'Advanced Computer Networks & Distributed Systems',
  subject: 'Computer Science & Engineering',
  department: 'Department of Computer Science & Engineering',
  type: 'End-Term Comprehensive Assessment',
  durationMinutes: 90,
  totalQuestions: 50,
  maxMarks: 100,
  passingMarks: 40,
  negativeMarking: '0.25 penalty (25% deduction per incorrect response)',
  markingScheme: {
    correct: '+2.0 marks per correct answer',
    incorrect: '-0.50 marks deduction for incorrect response',
    unattempted: '0.00 marks (no deduction for unattempted questions)',
  },
  rules: [
    'Strict Fullscreen Desktop Enforcement: The assessment requires an exclusive full-screen lock. Minimizing or switching windows is prohibited.',
    'Continuous Integrity Telemetry: Automated webcam and microphone monitoring runs locally to verify single-candidate presence.',
    'Two-Incident Tolerance Limit: Up to two window blur or peripheral change warnings are tolerated before the assessment session is locked.',
    'Real-Time Auto-Save: Every answer choice is immediately persisted to the local cache and synchronized with the proctoring service.',
    'Continuous Countdown Timer: Once initiated, the timer runs continuously and cannot be paused, reset, or extended.',
    'Free Navigation: You may freely flag questions for review and navigate across all sections before making the final submission.',
  ],
  permittedItems: [
    'One blank physical A4 sheet of scratch paper (must be shown to the camera during verification)',
    'Standard transparent physical ballpoint pen or pencil',
    'Clear, unlabeled transparent water bottle',
    'Physical Institutional Student ID Card or Government Photo Identification',
  ],
  prohibitedItems: [
    'Smartphones, smartwatches, fitness trackers, or any programmable wearable tech',
    'External monitors, secondary displays, projector splitters, or screen-mirroring devices',
    'Earphones, headphones, Bluetooth audio devices, or wireless transmitters',
    'Physical or digital calculators (unless an approved on-screen calculator is enabled in the exam view)',
    'Textbooks, printed cheat sheets, notebooks, or unauthorized reference materials',
    'Background communication or recording apps (Discord, Zoom, Slack, OBS, Teams, WhatsApp)',
  ],
  proctoringWarning:
    'Athena enforces an automated zero-tolerance proctoring policy. Exiting full-screen mode, switching browser tabs, connecting external monitors, or moving away from camera view will be immediately registered as a proctoring incident. Severe or repeated infractions will result in automatic exam submission and academic reporting.',
};

export default function ExamInstructions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();

  const [acknowledged, setAcknowledged] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);

  // Read passed exam data from navigation state if available, or fallback to sensible default
  const passedExam = location.state?.exam;
  const exam = {
    ...DEFAULT_EXAM_DATA,
    ...(passedExam || {}),
    // Normalize properties
    title: passedExam?.title || DEFAULT_EXAM_DATA.title,
    subject: passedExam?.subject || passedExam?.department || DEFAULT_EXAM_DATA.subject,
    durationMinutes: passedExam?.durationMinutes || DEFAULT_EXAM_DATA.durationMinutes,
    totalQuestions: passedExam?.totalQuestions || DEFAULT_EXAM_DATA.totalQuestions,
    maxMarks: passedExam?.totalMarks || passedExam?.maxMarks || DEFAULT_EXAM_DATA.maxMarks,
    passingMarks: passedExam?.passingMarks || DEFAULT_EXAM_DATA.passingMarks,
    negativeMarking: passedExam?.negativeMarking || DEFAULT_EXAM_DATA.negativeMarking,
  };

  useEffect(() => {
    let isCancelled = false;
    async function verifyAttempt() {
      if (!token) return;
      try {
        const examId = exam?.id || 'cs-401';
        const res = await fetch(`http://localhost:5050/api/exams/${examId}?checkOnly=true`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (!isCancelled) {
          if (!res.ok && data.code === 'ALREADY_SUBMITTED') {
            setAlreadySubmitted(true);
          } else if (res.ok && data.isInProgress) {
            setIsInProgress(true);
          }
        }
      } catch (err) {
        console.warn('Attempt verification error in instructions:', err);
      }
    }
    verifyAttempt();
    return () => {
      isCancelled = true;
    };
  }, [token, exam?.id]);

  const handleBack = () => {
    navigate('/dashboard', { state: { tab: alreadySubmitted ? 'history' : 'exams' } });
  };

  const handleContinue = () => {
    if (!acknowledged || alreadySubmitted) return;
    navigate('/system-check', { state: { exam } });
  };

  const handleToggleAcknowledge = () => {
    setAcknowledged((prev) => !prev);
  };

  return (
    <div className="instructions-page">
      {/* Institutional Top Navigation Bar */}
      <header className="instructions-topbar">
        <div className="instructions-topbar-inner">
          <div className="instructions-brand">
            <button
              onClick={handleBack}
              className="btn btn-secondary btn-sm instructions-back-btn"
              title="Return to Dashboard"
              aria-label="Return to Dashboard"
            >
              <ArrowLeft size={15} />
              <span>Back to Dashboard</span>
            </button>
            <div className="instructions-brand-divider" />
            <div className="instructions-brand-badge">
              <div className="instructions-brand-icon">
                <Shield size={16} />
              </div>
              <div className="instructions-brand-title">
                <span>ATHENA</span>
                <span className="instructions-brand-sub">Secure Assessment</span>
              </div>
            </div>
          </div>

          {/* Workflow Step Tracker */}
          <div className="instructions-steps-tracker">
            <div className="step-pill active">
              <span className="step-number">1</span>
              <span className="step-label">Instructions</span>
            </div>
            <div className="step-divider" />
            <div className="step-pill upcoming">
              <span className="step-number">2</span>
              <span className="step-label">System Check</span>
            </div>
            <div className="step-divider" />
            <div className="step-pill upcoming">
              <span className="step-number">3</span>
              <span className="step-label">Verification</span>
            </div>
            <div className="step-divider" />
            <div className="step-pill upcoming">
              <span className="step-number">4</span>
              <span className="step-label">Exam</span>
            </div>
          </div>

          {/* Candidate Profile Info */}
          <div className="instructions-user-badge">
            <div className="instructions-user-avatar">
              {user?.name ? user.name[0].toUpperCase() : 'C'}
            </div>
            <div className="instructions-user-meta">
              <span className="instructions-user-name">{user?.name || 'Candidate'}</span>
              <span className="instructions-user-id">{user?.email || 'Authenticated'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="instructions-container">
        {/* Exam Title & Subject Header Banner */}
        <section className="instructions-hero surface-card">
          <div className="instructions-hero-top">
            <div className="instructions-hero-tags">
              <span className="font-mono exam-code-tag">{exam.code}</span>
              <span className="instructions-subject-tag">{exam.subject}</span>
              <span className="status-pill status-indigo">
                <Lock size={11} style={{ marginRight: 2 }} />
                Proctored Desktop Environment
              </span>
            </div>
            <div className="status-pill status-emerald">
              <span className="status-dot" />
              Ready for Preparation
            </div>
          </div>

          <h1 className="instructions-hero-title">{exam.title}</h1>
          <p className="instructions-hero-desc">
            {exam.type} • Read all regulations, scoring rules, and proctoring constraints carefully before proceeding to system diagnostics.
          </p>

          {alreadySubmitted && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px 18px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#fca5a5', fontWeight: 500 }}>
                  You have already completed this examination. Only one attempt is permitted per student.
                </span>
              </div>
              <button
                onClick={handleBack}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
              >
                <ArrowLeft size={13} />
                <span>Return to Dashboard</span>
              </button>
            </div>
          )}

          {/* Key Quantitative Specs Grid */}
          <div className="instructions-metrics-grid">
            <div className="instruction-metric-card">
              <div className="instruction-metric-icon">
                <Clock size={18} />
              </div>
              <div className="instruction-metric-data">
                <div className="instruction-metric-label">Allotted Duration</div>
                <div className="instruction-metric-value tabular-nums">
                  {exam.durationMinutes} <span className="instruction-metric-unit">Minutes</span>
                </div>
              </div>
            </div>

            <div className="instruction-metric-card">
              <div className="instruction-metric-icon">
                <FileText size={18} />
              </div>
              <div className="instruction-metric-data">
                <div className="instruction-metric-label">Total Questions</div>
                <div className="instruction-metric-value tabular-nums">
                  {exam.totalQuestions} <span className="instruction-metric-unit">Questions</span>
                </div>
              </div>
            </div>

            <div className="instruction-metric-card">
              <div className="instruction-metric-icon">
                <Award size={18} />
              </div>
              <div className="instruction-metric-data">
                <div className="instruction-metric-label">Maximum Marks</div>
                <div className="instruction-metric-value tabular-nums">
                  {exam.maxMarks} <span className="instruction-metric-unit">Points</span>
                </div>
              </div>
            </div>

            <div className="instruction-metric-card">
              <div className="instruction-metric-icon">
                <CheckCircle2 size={18} />
              </div>
              <div className="instruction-metric-data">
                <div className="instruction-metric-label">Passing Criteria</div>
                <div className="instruction-metric-value tabular-nums">
                  {exam.passingMarks} <span className="instruction-metric-unit">Points (40%)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Marking Scheme & Scoring Policy */}
        <section className="instructions-section surface-card">
          <div className="instructions-section-header">
            <div className="instructions-section-icon-box">
              <Award size={18} />
            </div>
            <div>
              <h2 className="instructions-section-title">Marking Scheme & Scoring Policy</h2>
              <p className="instructions-section-sub">
                Evaluations are computed automatically according to institutional criteria.
              </p>
            </div>
          </div>

          <div className="marking-scheme-grid">
            <div className="marking-tile marking-positive">
              <div className="marking-tile-header">
                <span className="marking-pill pill-positive">Correct Answer</span>
                <span className="marking-score tabular-nums">+2.00</span>
              </div>
              <p className="marking-tile-desc">
                Full designated weight is awarded for every accurately selected answer choice.
              </p>
            </div>

            <div className="marking-tile marking-negative">
              <div className="marking-tile-header">
                <span className="marking-pill pill-negative">Negative Marking</span>
                <span className="marking-score tabular-nums">-0.50</span>
              </div>
              <p className="marking-tile-desc">
                {exam.negativeMarking || 'A 25% penalty applies for each incorrect choice.'}
              </p>
            </div>

            <div className="marking-tile marking-neutral">
              <div className="marking-tile-header">
                <span className="marking-pill pill-neutral">Unattempted Question</span>
                <span className="marking-score tabular-nums">0.00</span>
              </div>
              <p className="marking-tile-desc">
                No marks are gained or deducted for questions left blank or unattempted.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Critical Proctoring Security Warning */}
        <section className="instructions-warning-card">
          <div className="instructions-warning-header">
            <div className="instructions-warning-icon">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="instructions-warning-title">Proctoring Enforcement & Window Lockdown Notice</h3>
              <p className="instructions-warning-text">{exam.proctoringWarning}</p>
            </div>
          </div>
        </section>

        {/* Section: Examination Guidelines & Conduct Rules */}
        <section className="instructions-section surface-card">
          <div className="instructions-section-header">
            <div className="instructions-section-icon-box">
              <Info size={18} />
            </div>
            <div>
              <h2 className="instructions-section-title">Rules & Examination Guidelines</h2>
              <p className="instructions-section-sub">
                Compliance with the following standard operating procedures is mandatory.
              </p>
            </div>
          </div>

          <ul className="rules-list-container">
            {exam.rules.map((rule, idx) => (
              <li key={idx} className="rule-list-item">
                <span className="rule-number-badge font-mono">{idx + 1}</span>
                <span className="rule-text">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Section: Permitted vs Prohibited Items Grid */}
        <div className="items-comparison-grid">
          {/* Permitted Items */}
          <div className="surface-card items-column items-permitted">
            <div className="items-column-header">
              <div className="items-badge items-badge-permitted">
                <Check size={16} />
              </div>
              <div>
                <h3 className="items-column-title">Permitted Items</h3>
                <span className="items-column-subtitle">Authorized for desktop workspace</span>
              </div>
            </div>

            <ul className="items-checklist">
              {exam.permittedItems.map((item, idx) => (
                <li key={idx} className="checklist-entry entry-permitted">
                  <CheckCircle2 size={16} className="checklist-icon-permitted" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Prohibited Items */}
          <div className="surface-card items-column items-prohibited">
            <div className="items-column-header">
              <div className="items-badge items-badge-prohibited">
                <Ban size={16} />
              </div>
              <div>
                <h3 className="items-column-title">Prohibited Items</h3>
                <span className="items-column-subtitle">Strictly forbidden in testing area</span>
              </div>
            </div>

            <ul className="items-checklist">
              {exam.prohibitedItems.map((item, idx) => (
                <li key={idx} className="checklist-entry entry-prohibited">
                  <Ban size={16} className="checklist-icon-prohibited" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Section: Mandatory Candidate Acknowledgement Checkbox */}
        <section
          className={`acknowledgement-container surface-card ${acknowledged ? 'acknowledged-active' : ''
            }`}
        >
          <div className="acknowledgement-layout">
            <div
              className="acknowledgement-interactive"
              onClick={handleToggleAcknowledge}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleToggleAcknowledge();
                }
              }}
              aria-pressed={acknowledged}
            >
              <input
                type="checkbox"
                id="exam-acknowledgement-checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="visually-hidden"
                aria-describedby="acknowledgement-description"
              />

              <div className={`custom-checkbox ${acknowledged ? 'checked' : ''}`}>
                {acknowledged ? <CheckSquare size={20} /> : <Square size={20} />}
              </div>

              <div className="acknowledgement-text-content">
                <label
                  htmlFor="exam-acknowledgement-checkbox"
                  className="acknowledgement-label"
                  onClick={(e) => e.stopPropagation()}
                >
                  I have read and understood the examination instructions and agree to follow the examination rules.
                </label>
                <p id="acknowledgement-description" className="acknowledgement-subtext">
                  By checking this box, you certify your identity and accept that violations of proctoring protocol may result in disciplinary action.
                </p>
              </div>
            </div>

            <div className="acknowledgement-status">
              {acknowledged ? (
                <span className="status-pill status-emerald">
                  <span className="status-dot" />
                  Acknowledged & Ready
                </span>
              ) : (
                <span className="status-pill status-amber">
                  <span className="status-dot" />
                  Acknowledgement Required
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Section: Sticky / Bottom Action Navigation Bar */}
        <footer className="instructions-actions-bar surface-card">
          <div className="actions-left">
            <button
              onClick={handleBack}
              className="btn btn-secondary"
              aria-label="Return to Dashboard"
            >
              <ArrowLeft size={16} />
              <span>Back to Dashboard</span>
            </button>
            <span className="actions-hint-text">
              {acknowledged
                ? 'Ready to proceed with hardware and environment readiness.'
                : 'Select the acknowledgement checkbox above to enable continuation.'}
            </span>
          </div>

          <div className="actions-right">
            <button
              onClick={handleContinue}
              disabled={!acknowledged || alreadySubmitted}
              className="btn btn-primary instructions-continue-btn"
              title={
                alreadySubmitted
                  ? 'Exam already completed'
                  : acknowledged
                  ? 'Proceed to System Diagnostics'
                  : 'Please acknowledge the instructions first'
              }
              aria-disabled={!acknowledged || alreadySubmitted}
            >
              <span>{alreadySubmitted ? 'Attempt Already Completed' : isInProgress ? 'Proceed to Resume Exam' : 'Continue to System Check'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
