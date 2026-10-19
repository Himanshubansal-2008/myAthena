import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Flag,
  RotateCcw,
  Keyboard,
  Clock,
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

  // Navigation, Answer & Review Flag State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [flaggedQuestions, setFlaggedQuestions] = useState({});
  const [attemptId, setAttemptId] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  // Persistent Answer Saving States: 'saved' | 'saving' | 'failed'
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [failedSaveError, setFailedSaveError] = useState(null);

  // Rapid Changes & Stale Request Safeguards
  const questionSeqRef = useRef({});
  const questionTimestampRef = useRef({});
  const abortControllersRef = useRef({});
  const inFlightCountRef = useRef(0);
  const failedOperationsRef = useRef(new Map());

  // Timer & Deadline State
  const [deadlineTime, setDeadlineTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  // Safeguard Refs to prevent double submission or race conditions
  const isSubmittingRef = useRef(false);
  const isSubmittedRef = useRef(false);
  const selectedAnswersRef = useRef(selectedAnswers);

  useEffect(() => {
    selectedAnswersRef.current = selectedAnswers;
  }, [selectedAnswers]);

  // Live Candidate Video PiP Stream
  const [cameraActive, setCameraActive] = useState(false);
  const pipVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  useEffect(() => {
    let streamInstance = null;
    let isCancelled = false;

    async function startPipCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: 'user',
          },
          audio: false,
        });
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamInstance = stream;
        cameraStreamRef.current = stream;
        setCameraActive(true);

        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = stream;
          pipVideoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn('PiP Camera initialization error:', err);
        if (!isCancelled) setCameraActive(false);
      }
    }

    startPipCamera();

    return () => {
      isCancelled = true;
      if (streamInstance) {
        streamInstance.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
        cameraStreamRef.current = null;
      }
    };
  }, []);

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

        // Record active attempt session ID
        if (data.attempt?.id) {
          setAttemptId(data.attempt.id);
        }

        // Pre-populate previously stored in-progress answers if returned by session
        if (data.answers && typeof data.answers === 'object') {
          setSelectedAnswers(data.answers);
        }

        // Pre-populate review flags if returned by session
        if (data.flags && typeof data.flags === 'object') {
          setFlaggedQuestions(data.flags);
        }

        // Initialize deadline timer
        if (data.attempt?.deadlineAt) {
          setDeadlineTime(new Date(data.attempt.deadlineAt).getTime());
        } else {
          const durationMinutes = data.exam?.durationMinutes || 90;
          setDeadlineTime(Date.now() + durationMinutes * 60 * 1000);
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

  // Automatic Submission on Deadline Timeout
  const handleTimeoutSubmit = useCallback(async () => {
    if (isSubmittingRef.current || isSubmittedRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setIsTimeout(true);

    try {
      const response = await fetch(`${API_BASE_URL}/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: selectedAnswersRef.current,
          isTimeout: true,
        }),
      });

      const data = await response.json();

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      if (response.ok) {
        setSubmissionResult(data.result);
        setIsSubmitted(true);
        isSubmittedRef.current = true;
      } else if (response.status === 403 || data.code === 'ALREADY_SUBMITTED') {
        setError({
          message: data.message || 'Assessment deadline has expired and answers were recorded.',
          code: 'ALREADY_SUBMITTED',
          status: response.status,
        });
      }
    } catch (err) {
      console.error('Timeout auto-submit error:', err);
      setIsSubmitted(true);
      isSubmittedRef.current = true;
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setShowSubmitModal(false);
    }
  }, [examId, token]);

  // Countdown Timer Tick Effect
  useEffect(() => {
    if (isSubmitted || loading || error || !deadlineTime) return;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadlineTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        handleTimeoutSubmit();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadlineTime, isSubmitted, loading, error, handleTimeoutSubmit]);

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Persistent Save Function with stale-request prevention and retry queue
  const persistAnswerChange = useCallback(
    async (questionId, { selectedOption, isMarkedForReview }) => {
      if (!token || !examId) return;

      // Increment monotonic sequence number and record timestamp for this question
      const currentSeq = (questionSeqRef.current[questionId] || 0) + 1;
      questionSeqRef.current[questionId] = currentSeq;
      const clientTimestamp = Date.now();
      questionTimestampRef.current[questionId] = clientTimestamp;

      // Abort any prior in-flight request for this specific question to avoid race conditions
      if (abortControllersRef.current[questionId]) {
        try {
          abortControllersRef.current[questionId].abort();
        } catch (e) {}
      }

      const controller = new AbortController();
      abortControllersRef.current[questionId] = controller;

      inFlightCountRef.current += 1;
      setSaveStatus('saving');

      const payload = {
        questionId,
        selectedOption,
        isMarkedForReview,
        attemptId,
        clientTimestamp,
        sequence: currentSeq,
      };

      try {
        const res = await fetch(`${API_BASE_URL}/exams/${examId}/answer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const body = await res.json().catch(() => ({}));

        // If this request was aborted or superseded by a newer interaction, ignore response
        if (controller.signal.aborted || questionSeqRef.current[questionId] !== currentSeq) {
          return;
        }

        if (res.ok) {
          failedOperationsRef.current.delete(questionId);
          setFailedSaveError(null);
          setLastSavedTime(new Date());

          if (failedOperationsRef.current.size === 0 && inFlightCountRef.current <= 1) {
            setSaveStatus('saved');
          }
        } else if (res.status === 403) {
          if (body.code === 'ALREADY_SUBMITTED') {
            setError({
              message: body.message || 'This examination session has already been submitted.',
              code: 'ALREADY_SUBMITTED',
              status: 403,
            });
          } else if (body.code === 'EXAM_TIMEOUT') {
            handleTimeoutSubmit();
          } else {
            failedOperationsRef.current.set(questionId, payload);
            setSaveStatus('failed');
            setFailedSaveError(body.message || 'Answer save rejected by server.');
          }
        } else {
          failedOperationsRef.current.set(questionId, payload);
          setSaveStatus('failed');
          setFailedSaveError(body.message || 'Failed to save answer to server.');
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // Normal abort when rapid changes occur, not a true failure
          return;
        }
        if (questionSeqRef.current[questionId] !== currentSeq) {
          return;
        }
        console.error('Answer save failed:', err);
        failedOperationsRef.current.set(questionId, payload);
        setSaveStatus('failed');
        setFailedSaveError('Network error while saving response. Please retry.');
      } finally {
        inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
        if (failedOperationsRef.current.size > 0) {
          setSaveStatus('failed');
        } else if (inFlightCountRef.current === 0) {
          setSaveStatus('saved');
        }
      }
    },
    [token, examId, attemptId, handleTimeoutSubmit]
  );

  // Retry all failed saves in the queue
  const retryFailedSaves = useCallback(() => {
    if (failedOperationsRef.current.size === 0) return;
    const opsToRetry = Array.from(failedOperationsRef.current.entries());
    failedOperationsRef.current.clear();
    setFailedSaveError(null);

    opsToRetry.forEach(([qId, payload]) => {
      persistAnswerChange(qId, {
        selectedOption: payload.selectedOption,
        isMarkedForReview: payload.isMarkedForReview,
      });
    });
  }, [persistAnswerChange]);

  // Handle single-option answer selection associated with the question ID
  const handleSelectOption = useCallback(
    (questionId, optionIndex) => {
      if (isSubmittingRef.current || isSubmittedRef.current || timeLeft === 0) return;

      setSelectedAnswers((prev) => ({
        ...prev,
        [questionId]: optionIndex,
      }));

      // Persist answer choice to backend PostgreSQL
      persistAnswerChange(questionId, {
        selectedOption: optionIndex,
        isMarkedForReview: Boolean(flaggedQuestions[questionId]),
      });
    },
    [timeLeft, flaggedQuestions, persistAnswerChange]
  );

  // Handle Clear Answer for a question (or current question)
  const handleClearAnswer = useCallback(
    (questionId) => {
      if (!questionId || isSubmittingRef.current || isSubmittedRef.current || timeLeft === 0) return;

      setSelectedAnswers((prev) => {
        if (prev[questionId] === undefined) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });

      // Persist cleared answer (selectedOption = null) to PostgreSQL
      persistAnswerChange(questionId, {
        selectedOption: null,
        isMarkedForReview: Boolean(flaggedQuestions[questionId]),
      });
    },
    [timeLeft, flaggedQuestions, persistAnswerChange]
  );

  // Handle Toggle Review Flag for a question (or current question)
  const handleToggleFlag = useCallback(
    (questionId) => {
      if (!questionId || isSubmittingRef.current || isSubmittedRef.current || timeLeft === 0) return;

      const nextFlag = !flaggedQuestions[questionId];

      setFlaggedQuestions((prev) => ({
        ...prev,
        [questionId]: nextFlag,
      }));

      // Persist review flag to backend PostgreSQL
      persistAnswerChange(questionId, {
        selectedOption: selectedAnswers[questionId] !== undefined ? selectedAnswers[questionId] : null,
        isMarkedForReview: nextFlag,
      });
    },
    [timeLeft, flaggedQuestions, selectedAnswers, persistAnswerChange]
  );

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
    if (isSubmittingRef.current || isSubmittedRef.current) return;
    setShowSubmitModal(true);
  };

  const handleCloseSubmitDialog = () => {
    if (isSubmittingRef.current) return;
    setShowSubmitModal(false);
  };

  const handleConfirmSubmit = async () => {
    if (isSubmittingRef.current || isSubmittedRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: selectedAnswers,
          isTimeout: false,
        }),
      });

      const data = await response.json();

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      if (response.ok) {
        setSubmissionResult(data.result);
        setIsSubmitted(true);
        isSubmittedRef.current = true;
        setShowSubmitModal(false);
      } else if (response.status === 403 || data.code === 'ALREADY_SUBMITTED') {
        setError({
          message: data.message || 'You have already completed and submitted this examination.',
          code: 'ALREADY_SUBMITTED',
          status: response.status,
        });
        setShowSubmitModal(false);
      } else {
        alert(data.message || 'Submission failed. Please check network connection and try again.');
      }
    } catch (err) {
      console.error('Submit exam error:', err);
      alert('Unable to submit exam due to a network error. Please try again.');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Derived state
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex] || null;
  const answeredCount = Object.keys(selectedAnswers).length;
  const flaggedCount = Object.values(flaggedQuestions).filter(Boolean).length;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  const isCurrentFlagged = currentQuestion ? Boolean(flaggedQuestions[currentQuestion.id]) : false;
  const currentSelectedOption = currentQuestion ? selectedAnswers[currentQuestion.id] : undefined;

  // Keyboard Shortcuts (A, B, C, D to select, X to clear)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showSubmitModal) return;

      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (!currentQuestion) return;

      const key = e.key.toUpperCase();
      const optionLetters = ['A', 'B', 'C', 'D'];
      const optionIndex = optionLetters.indexOf(key);

      if (optionIndex !== -1) {
        if (
          Array.isArray(currentQuestion.options) &&
          optionIndex < currentQuestion.options.length
        ) {
          e.preventDefault();
          handleSelectOption(currentQuestion.id, optionIndex);
        }
        return;
      }

      if (key === 'X') {
        if (selectedAnswers[currentQuestion.id] !== undefined) {
          e.preventDefault();
          handleClearAnswer(currentQuestion.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSubmitModal, currentQuestion, selectedAnswers, handleSelectOption, handleClearAnswer]);

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
          <button
            onClick={() => {
              if (window.electronAPI && typeof window.electronAPI.setFullscreen === 'function') {
                window.electronAPI.setFullscreen(false).catch(() => {});
              }
              navigate('/dashboard', { state: { tab: error.code === 'ALREADY_SUBMITTED' ? 'history' : 'exams' } });
            }}
            className="btn btn-primary"
            style={{ margin: '0 auto' }}
          >
            <ArrowLeft size={15} />
            <span>{error.code === 'ALREADY_SUBMITTED' ? 'View Past Results' : 'Return to Dashboard'}</span>
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
        <div className="surface-card" style={{ padding: '40px', textAlign: 'center', maxWidth: '520px', width: '90%' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: isTimeout ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${isTimeout ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: isTimeout ? '#fbbf24' : '#34d399',
            }}
          >
            {isTimeout ? <Clock size={28} /> : <Check size={28} />}
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
            {isTimeout ? 'Assessment Concluded — Time Expired' : 'Examination Completed & Submitted'}
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
            {isTimeout
              ? `The time allotted for ${exam?.title || 'this examination'} has expired. Your responses were automatically finalized and graded.`
              : `Your assessment session for ${exam?.title || 'this examination'} has been securely submitted and graded.`}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              padding: '16px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Questions</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#f3f5f8', marginTop: '4px' }}>
                {totalQuestions}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Answered</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                {answeredCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#a5b4fc', marginTop: '4px' }}>
                {submissionResult?.score !== undefined ? `${submissionResult.score}/${submissionResult.totalMarks || 100}` : 'Recorded'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12.5px', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(239, 68, 68, 0.25)', marginBottom: '24px' }}>
            Athena Single-Attempt Rule: You cannot re-enter or retake this examination.
          </div>

          <button
            onClick={() => {
              if (window.electronAPI && typeof window.electronAPI.setFullscreen === 'function') {
                window.electronAPI.setFullscreen(false).catch(() => {});
              }
              navigate('/dashboard', { state: { tab: 'history' } });
            }}
            className="btn btn-primary"
            style={{ margin: '0 auto' }}
          >
            <ArrowLeft size={15} />
            <span>View Results in Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // --- STATE 5: LIVE EXAMINATION INTERFACE ---
  const optionsList = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];

  return (
    <div className="exam-room-root">
      {/* Top Bar: Exam Title, Subject/Code, Timer, and Submit Action */}
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

          <div className="exam-proctor-badges" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Persistent Save Status Indicator */}
            <div
              id="exam-save-indicator"
              className={`exam-save-pill ${saveStatus}`}
              title={
                saveStatus === 'saved'
                  ? lastSavedTime
                    ? `All answers synced with server at ${lastSavedTime.toLocaleTimeString()}`
                    : 'All answers synced with server'
                  : saveStatus === 'saving'
                  ? 'Persisting answer changes to server...'
                  : 'Failed to persist answers. Click to retry.'
              }
            >
              {saveStatus === 'saving' && (
                <>
                  <RotateCcw size={13} className="spin-animation" />
                  <span>Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check size={13} />
                  <span>Saved</span>
                </>
              )}
              {saveStatus === 'failed' && (
                <button
                  id="btn-retry-save-indicator"
                  type="button"
                  onClick={retryFailedSaves}
                  className="btn-retry-inline"
                  title="Click to retry saving unsaved answers"
                >
                  <AlertTriangle size={13} />
                  <span>Save Failed • Retry</span>
                </button>
              )}
            </div>

            {/* Live Countdown Timer */}
            <div
              className="exam-timer-pill font-mono"
              style={{
                color: timeLeft !== null && timeLeft <= 60 ? '#f87171' : timeLeft !== null && timeLeft <= 300 ? '#fbbf24' : '#f3f5f8',
                borderColor: timeLeft !== null && timeLeft <= 60 ? 'rgba(239, 68, 68, 0.45)' : timeLeft !== null && timeLeft <= 300 ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-default)',
                background: timeLeft !== null && timeLeft <= 60 ? 'rgba(239, 68, 68, 0.12)' : timeLeft !== null && timeLeft <= 300 ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-surface-elevated)',
              }}
              title={timeLeft !== null && timeLeft <= 300 ? 'Warning: Less than 5 minutes remaining!' : 'Assessment countdown timer'}
            >
              <Clock size={14} color={timeLeft !== null && timeLeft <= 60 ? '#f87171' : timeLeft !== null && timeLeft <= 300 ? '#fbbf24' : 'var(--text-muted)'} />
              <span>{formatTime(timeLeft)}</span>
            </div>

            <button
              id="btn-submit-exam"
              onClick={handleOpenSubmitDialog}
              disabled={isSubmitting}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={13} />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Exam'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Save Failure Alert Banner if a network save failed */}
      {saveStatus === 'failed' && (
        <div className="exam-save-failed-banner animate-fade-in" role="alert">
          <div className="exam-save-failed-content">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Connection Warning:</strong> Your recent response could not be saved to the database. {failedSaveError || 'Please check your connection.'}
            </span>
          </div>
          <button
            id="btn-retry-failed-saves"
            type="button"
            onClick={retryFailedSaves}
            className="btn btn-secondary btn-sm"
            style={{ padding: '3px 10px', fontSize: '12px', background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <RotateCcw size={12} />
            <span>Retry Save</span>
          </button>
        </div>
      )}

      {/* Main Examination Viewport */}
      <main className="exam-room-main">
        {/* Left Side: Question Navigation Area */}
        <aside className="exam-room-sidebar">
          {/* Live Candidate Proctoring Video Stream */}
          <div className="surface-card proctor-pip-card" style={{ marginBottom: '16px' }}>
            <div className="proctor-pip-header">
              <span
                className="pip-status-dot"
                style={{
                  background: cameraActive ? '#10b981' : '#ef4444',
                  boxShadow: cameraActive ? '0 0 6px #10b981' : 'none',
                }}
              />
              <span className="pip-title">
                {cameraActive ? 'Candidate Video Feed' : 'Camera Feed Disconnected'}
              </span>
            </div>
            <div className="proctor-pip-viewport">
              <video
                ref={(el) => {
                  pipVideoRef.current = el;
                  if (el && cameraStreamRef.current && el.srcObject !== cameraStreamRef.current) {
                    el.srcObject = cameraStreamRef.current;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="proctor-pip-video"
                aria-label="Live Candidate Feed"
              />
              <div className="pip-overlay-badge">
                <span
                  className="pulse-dot"
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: cameraActive ? '#10b981' : '#ef4444',
                  }}
                />
                <span>{cameraActive ? 'LIVE PROCTOR' : 'OFFLINE'}</span>
              </div>
            </div>
          </div>

          <div className="question-palette-card surface-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 className="palette-title" style={{ margin: 0 }}>
                Question Palette
              </h3>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {answeredCount}/{totalQuestions} Answered
              </span>
            </div>

            {/* Question Palette Numbered Buttons */}
            <div className="palette-grid">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentQuestionIndex;
                const isAnswered = selectedAnswers[q.id] !== undefined;
                const isFlagged = Boolean(flaggedQuestions[q.id]);

                return (
                  <button
                    key={q.id}
                    id={`nav-question-${idx + 1}`}
                    type="button"
                    onClick={() => handleJumpToQuestion(idx)}
                    className={`palette-btn font-mono ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''} ${isFlagged ? 'flagged' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    aria-label={`Question ${idx + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}${isFlagged ? ', Flagged for review' : ''}${isCurrent ? ' (Current)' : ''}`}
                    title={`Question ${idx + 1}${isAnswered ? ' • Answered' : ' • Unanswered'}${isFlagged ? ' • Flagged for review' : ''}${isCurrent ? ' • Current' : ''}`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && <span className="palette-flag-corner" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {/* Compact Legend */}
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
                <span className="legend-dot flagged" />
                <span>Flagged for Review ({flaggedCount})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot unanswered" />
                <span>Unanswered ({unansweredCount})</span>
              </div>
            </div>

            {/* Keyboard Shortcuts Hint */}
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <Keyboard size={13} />
                <span>Keyboard Shortcuts</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Select option</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>A, B, C, D</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Clear answer</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>X</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center / Right: Question Content and Multiple Choice Options */}
        <div className="exam-question-area">
          <div className="surface-card question-display-card animate-fade-in">
            {/* Question Header: Counter, Marks, and Action Controls */}
            <div className="question-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="question-number-pill">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </span>
                <span className="question-points-pill font-mono">
                  +{currentQuestion.marks || 1}.0 Point{currentQuestion.marks > 1 ? 's' : ''}
                </span>
                {isCurrentFlagged && (
                  <span className="question-flagged-tag font-mono">
                    <Flag size={11} fill="#fbbf24" color="#fbbf24" />
                    <span>FLAGGED</span>
                  </span>
                )}
              </div>

              {/* Action Controls: Flag for Review and Clear Answer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  id="btn-flag-question"
                  type="button"
                  onClick={() => handleToggleFlag(currentQuestion.id)}
                  className={`btn btn-sm ${isCurrentFlagged ? 'btn-flagged' : 'btn-secondary'}`}
                  aria-pressed={isCurrentFlagged}
                  title={isCurrentFlagged ? 'Remove review flag' : 'Flag this question for later review'}
                >
                  <Flag
                    size={13}
                    fill={isCurrentFlagged ? '#fbbf24' : 'none'}
                    color={isCurrentFlagged ? '#fbbf24' : 'currentColor'}
                  />
                  <span>{isCurrentFlagged ? 'Flagged' : 'Flag for Review'}</span>
                </button>

                <button
                  id="btn-clear-answer"
                  type="button"
                  onClick={() => handleClearAnswer(currentQuestion.id)}
                  disabled={currentSelectedOption === undefined}
                  className="btn btn-secondary btn-sm"
                  aria-label="Clear selected answer"
                  title={currentSelectedOption === undefined ? 'No answer selected' : 'Clear selected answer (Shortcut: X)'}
                  style={{
                    opacity: currentSelectedOption === undefined ? 0.45 : 1,
                    cursor: currentSelectedOption === undefined ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Clear</span>
                  <kbd className="shortcut-badge font-mono">X</kbd>
                </button>
              </div>
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
                    aria-label={`Option ${letter}: ${optionText}`}
                    title={`Press ${letter} to select`}
                  >
                    <div className="option-letter-tag font-mono">{letter}</div>
                    <div className="option-radio-indicator">
                      {isSelected ? <Check size={13} strokeWidth={3} /> : null}
                    </div>
                    <span className="option-text">{optionText}</span>
                    <kbd className="shortcut-badge font-mono" style={{ opacity: 0.6, fontSize: '10px' }}>
                      {letter}
                    </kbd>
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

            {flaggedCount > 0 && (
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
                  marginBottom: '12px',
                }}
              >
                <Flag size={15} flexShrink={0} fill="#fbbf24" />
                <span>
                  You have <strong>{flaggedCount}</strong> question{flaggedCount > 1 ? 's' : ''} marked for review.
                </span>
              </div>
            )}

            {unansweredCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
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

            {failedOperationsRef.current.size > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  color: '#fca5a5',
                  fontSize: '12.5px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} flexShrink={0} color="#f87171" />
                  <span>
                    Warning: You have <strong>{failedOperationsRef.current.size}</strong> unsaved answer change{failedOperationsRef.current.size > 1 ? 's' : ''}.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={retryFailedSaves}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '11px', background: 'rgba(255, 255, 255, 0.15)' }}
                >
                  Retry Now
                </button>
              </div>
            )}

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '24px' }}>
              Are you sure you want to conclude and submit your answers? You will not be able to re-enter this examination once confirmed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={handleCloseSubmitDialog} disabled={isSubmitting} className="btn btn-secondary">
                Return to Exam
              </button>
              <button
                id="btn-confirm-submit"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="btn btn-primary"
              >
                <span>{isSubmitting ? 'Submitting Assessment...' : 'Confirm & Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
