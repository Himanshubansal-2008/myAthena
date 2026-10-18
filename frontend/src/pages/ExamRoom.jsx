import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  AlertCircle,
  FileText,
  X,
  Send,
  HelpCircle,
} from 'lucide-react';
import './pages.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const API_BASE_URL = 'http://localhost:5050/api';

export default function ExamRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { token } = useAuth();

  // Resolve exam ID from URL parameter or navigation state (fallback: cs-401)
  const examId = useMemo(() => {
    if (params.examId && params.examId !== 'live') {
      return params.examId;
    }
    return location.state?.exam?.id || 'cs-401';
  }, [params.examId, location.state]);

  // Exam Data States
  const [exam, setExam] = useState(location.state?.exam || null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-Memory Navigation & Answer State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Fetch live examination questions and active attempt from backend
  useEffect(() => {
    let isCancelled = false;

    async function loadExamSession() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/exams/${examId}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const data = await response.json();

        if (isCancelled) return;

        if (!response.ok) {
          setError({
            message: data.message || 'Unable to load examination session.',
            code: data.code || 'LOAD_ERROR',
            status: response.status,
          });
          setLoading(false);
          return;
        }

        // Populate real exam metadata and questions from backend
        setExam(data.exam);

        const loadedQuestions = Array.isArray(data.questions)
          ? data.questions
          : Array.isArray(data.exam?.questions)
          ? data.exam.questions
          : [];

        setQuestions(loadedQuestions);

        // Pre-populate previously stored in-progress answers if returned by session
        if (data.answers && typeof data.answers === 'object') {
          setSelectedAnswers(data.answers);
        }

        setCurrentQuestionIndex(0);
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to retrieve live examination questions:', err);
          setError({
            message:
              'Network error while connecting to the assessment backend server. Please verify the backend service is running on http://localhost:5050.',
            code: 'NETWORK_ERROR',
          });
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadExamSession();

    return () => {
      isCancelled = true;
    };
  }, [examId, token]);

  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  // Handle single-option answer selection associated with the question ID
  const handleSelectOption = (questionId, optionIndex) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));

    if (token) {
      fetch(`${API_BASE_URL}/exams/${examId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ questionId, selectedOption: optionIndex }),
      }).catch((err) => console.warn('Failed to auto-save answer:', err));
    }
  };

  // Safe navigation handlers
  const handlePrevQuestion = () => {
    setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextQuestion = () => {
    setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1));
  };

  const handleJumpToQuestion = (index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentQuestionIndex(index);
    }
  };

  // Submit dialog actions
  const handleOpenSubmitDialog = () => {
    setShowSubmitModal(true);
  };

  const handleCloseSubmitDialog = () => {
    setShowSubmitModal(false);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ answers: selectedAnswers }),
      });

      const data = await response.json();
      if (response.ok) {
        setSubmissionResult(data.result);
        setIsSubmitted(true);
      } else {
        alert(data.message || 'Failed to submit examination.');
      }
    } catch (err) {
      console.error('Submission error:', err);
      setIsSubmitted(true);
    } finally {
      setSubmitting(false);
      setShowSubmitModal(false);
    }
  };

  // Derived state
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex] || null;
  const answeredCount = Object.keys(selectedAnswers).length;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  // --- STATE 1: LOADING STATE ---
  if (loading) {
    return (
      <div className="exam-room-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', maxWidth: '420px', width: '90%' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(79, 70, 229, 0.15)',
              border: '1px solid rgba(79, 70, 229, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#a5b4fc',
            }}
          >
            <Shield size={24} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f5f8', marginBottom: '8px' }}>
            Loading Examination
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Retrieving examination questions and initializing your authenticated candidate session...
          </p>
        </div>
      </div>
    );
  }

  // --- STATE 2: ERROR STATE (Unauthorized, Already Submitted, Invalid ID) ---
  if (error) {
    return (
      <div className="exam-room-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', maxWidth: '480px', width: '90%' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#f87171',
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f5f8', marginBottom: '8px' }}>
            {error.code === 'ALREADY_SUBMITTED' ? 'Assessment Already Submitted' : 'Unable to Access Examination'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
            {error.message}
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ margin: '0 auto' }}>
            <ArrowLeft size={15} />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // --- STATE 3: EMPTY QUESTIONS STATE ---
  if (totalQuestions === 0) {
    return (
      <div className="exam-room-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', maxWidth: '480px', width: '90%' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(148, 163, 184, 0.1)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--text-muted)',
            }}
          >
            <FileText size={24} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f5f8', marginBottom: '8px' }}>
            No Questions Available
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
            This examination has not yet been loaded with assessment questions. Please contact your examination proctor or institutional administrator.
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ margin: '0 auto' }}>
            <ArrowLeft size={15} />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // --- STATE 4: SUBMISSION CONFIRMED / CONCLUDED STATE ---
  if (isSubmitted) {
    return (
      <div className="exam-room-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', maxWidth: '480px', width: '90%' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#34d399',
            }}
          >
            <Check size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
            Examination Completed
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
            Your assessment session for <strong>{exam?.title || 'this examination'}</strong> has concluded. You recorded responses for <strong>{answeredCount}</strong> of <strong>{totalQuestions}</strong> questions.
          </p>

          {submissionResult && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Official Score</span>
                <span className="font-mono" style={{ fontSize: '16px', fontWeight: 700, color: submissionResult.passed ? '#34d399' : '#fbbf24' }}>
                  {submissionResult.score} / {submissionResult.totalMarks} pts ({submissionResult.percentage}%)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Evaluation Status</span>
                <span style={{ fontWeight: 600, color: submissionResult.passed ? '#34d399' : '#fbbf24' }}>
                  {submissionResult.passed ? 'PASSED (Satisfactory)' : 'FAILED (Under Passing Threshold)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Performance Breakdown</span>
                <span>{submissionResult.correctCount} Correct • {submissionResult.wrongCount} Incorrect</span>
              </div>
            </div>
          )}

          <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ margin: '0 auto' }}>
            <ArrowLeft size={15} />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // --- STATE 5: LIVE EXAMINATION INTERFACE ---
  const optionsList = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];
  const currentSelectedOption = selectedAnswers[currentQuestion.id];

  return (
    <div className="exam-room-root">
      {/* Top Bar: Exam Title, Subject/Code, and Visible Submit Exam Action */}
      <header className="exam-room-topbar">
        <div className="exam-room-topbar-inner">
          <div className="exam-title-box">
            <div className="exam-shield-icon">
              <Shield size={16} />
            </div>
            <div>
              <div className="exam-main-title">
                {exam?.title || 'Live Examination Assessment'}
              </div>
              <div className="exam-meta-sub">
                <span className="font-mono exam-code-tag">{exam?.code || exam?.id || 'EXAM'}</span>
                <span>• {exam?.description || 'Assessment Session'}</span>
              </div>
            </div>
          </div>

          <div className="exam-proctor-badges">
            <button
              id="btn-submit-exam"
              onClick={handleOpenSubmitDialog}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={13} />
              <span>Submit Exam</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Examination Viewport */}
      <main className="exam-room-main">
        {/* Left Side: Question Navigation Area */}
        <aside className="exam-room-sidebar">
          <div className="question-palette-card surface-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 className="palette-title" style={{ margin: 0 }}>
                Question Navigation
              </h3>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {answeredCount}/{totalQuestions}
              </span>
            </div>

            <div className="palette-grid">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentQuestionIndex;
                const isAnswered = selectedAnswers[q.id] !== undefined;

                return (
                  <button
                    key={q.id}
                    id={`nav-question-${idx + 1}`}
                    onClick={() => handleJumpToQuestion(idx)}
                    className={`palette-btn font-mono ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''}`}
                    title={`Question ${idx + 1}${isAnswered ? ' (Answered)' : ' (Unattempted)'}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="palette-legend">
              <div className="legend-item">
                <span className="legend-dot current" />
                <span>Current Question</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot answered" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot unanswered" />
                <span>Unattempted ({unansweredCount})</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center / Right: Question Content and Multiple Choice Options */}
        <div className="exam-question-area">
          <div className="surface-card question-display-card animate-fade-in">
            {/* Question Header: Counter and Marks */}
            <div className="question-header-row">
              <span className="question-number-pill">
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </span>
              <span className="question-points-pill font-mono">
                +{currentQuestion.marks || 1}.0 Point{currentQuestion.marks > 1 ? 's' : ''}
              </span>
            </div>

            {/* Question Prompt Text */}
            <h2 className="question-prompt-text">{currentQuestion.text}</h2>

            {/* Multiple-Choice Options A, B, C, D */}
            <div className="question-options-stack">
              {optionsList.map((optionText, optIdx) => {
                const letter = OPTION_LETTERS[optIdx] || String(optIdx + 1);
                const isSelected = currentSelectedOption === optIdx;

                return (
                  <button
                    key={optIdx}
                    id={`option-${currentQuestion.id}-${optIdx}`}
                    type="button"
                    onClick={() => handleSelectOption(currentQuestion.id, optIdx)}
                    className={`option-choice-btn ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="option-letter-tag font-mono">{letter}</div>
                    <div className="option-radio-indicator">
                      {isSelected ? <Check size={13} strokeWidth={3} /> : null}
                    </div>
                    <span className="option-text">{optionText}</span>
                  </button>
                );
              })}
            </div>

            {/* Question Footer: Previous, Next, and Submit Actions */}
            <div className="question-footer-row">
              <button
                id="btn-prev-question"
                onClick={handlePrevQuestion}
                disabled={currentQuestionIndex === 0}
                className="btn btn-secondary"
                style={{ opacity: currentQuestionIndex === 0 ? 0.45 : 1, cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer' }}
              >
                <ArrowLeft size={14} />
                <span>Previous</span>
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                {currentQuestionIndex < totalQuestions - 1 ? (
                  <button
                    id="btn-next-question"
                    onClick={handleNextQuestion}
                    className="btn btn-primary"
                  >
                    <span>Next Question</span>
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    id="btn-finish-exam-footer"
                    onClick={handleOpenSubmitDialog}
                    className="btn btn-primary"
                  >
                    <span>Review & Submit</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Dialog Before Final Submission */}
      {showSubmitModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="surface-card modal-content-card animate-fade-in" style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'rgba(79, 70, 229, 0.15)',
                    border: '1px solid rgba(79, 70, 229, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a5b4fc',
                  }}
                >
                  <Shield size={16} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f3f5f8', margin: 0 }}>
                  Confirm Exam Submission
                </h3>
              </div>
              <button
                onClick={handleCloseSubmitDialog}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
              You have answered <strong>{answeredCount}</strong> out of <strong>{totalQuestions}</strong> questions in this assessment.
            </p>

            {unansweredCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24',
                  fontSize: '12.5px',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={16} flexShrink={0} />
                <span>
                  You have <strong>{unansweredCount}</strong> unattempted question{unansweredCount > 1 ? 's' : ''} remaining.
                </span>
              </div>
            )}

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '24px' }}>
              Are you sure you want to conclude and submit your answers? You will not be able to re-enter this examination once confirmed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={handleCloseSubmitDialog} className="btn btn-secondary">
                Return to Exam
              </button>
              <button id="btn-confirm-submit" onClick={handleConfirmSubmit} className="btn btn-primary">
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
