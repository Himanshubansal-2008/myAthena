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
  CheckCircle2,
  XCircle,
  MinusCircle,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';
import './pages.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const API_BASE_URL = 'http://localhost:5050/api';
const MAX_AUTOSAVE_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

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
  const [waitingRoomData, setWaitingRoomData] = useState(null);
  const [waitingSecondsLeft, setWaitingSecondsLeft] = useState(null);

  // Navigation, Answer & Review Flag State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [flaggedQuestions, setFlaggedQuestions] = useState({});
  const [attemptId, setAttemptId] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isTimeout, setIsTimeout] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [proctorWarning, setProctorWarning] = useState(null);
  const lastLoggedIncidentRef = useRef({});

  // Persistent Answer Saving States: 'saved' | 'saving' | 'failed'
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [failedSaveError, setFailedSaveError] = useState(null);

  // Rapid Changes, Retry & Stale Request Safeguards
  const questionSeqRef = useRef({});
  const questionTimestampRef = useRef({});
  const abortControllersRef = useRef({});
  const inFlightCountRef = useRef(0);
  const failedOperationsRef = useRef(new Map());
  const retryTimersRef = useRef({});

  // Timer & Deadline State
  const [deadlineTime, setDeadlineTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);

  // Server-Authoritative Timer & Clock-Tamper Protection Refs
  const serverDeadlineMsRef = useRef(null);
  const serverTimeOffsetRef = useRef(0);
  const syncMonotonicRef = useRef(null);
  const syncRemainingSecondsRef = useRef(null);
  const isResyncingTimerRef = useRef(false);

  // Safeguard Refs to prevent double submission or race conditions
  const isSubmittingRef = useRef(false);
  const isSubmittedRef = useRef(false);
  const selectedAnswersRef = useRef(selectedAnswers);
  const flaggedQuestionsRef = useRef(flaggedQuestions);
  const attemptIdRef = useRef(attemptId);

  useEffect(() => {
    selectedAnswersRef.current = selectedAnswers;
  }, [selectedAnswers]);

  useEffect(() => {
    flaggedQuestionsRef.current = flaggedQuestions;
  }, [flaggedQuestions]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  // Clean up any pending retry timers or network requests on unmount
  useEffect(() => {
    return () => {
      Object.values(retryTimersRef.current).forEach((t) => clearTimeout(t));
      Object.values(abortControllersRef.current).forEach((c) => {
        try { c.abort(); } catch (e) {}
      });
    };
  }, []);

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
          if (data.code === 'EXAM_NOT_STARTED_YET') {
            const secs = data.startsInSeconds || Math.max(0, Math.floor((new Date(data.startTime).getTime() - Date.now()) / 1000));
            setWaitingRoomData({
              startTime: data.startTime,
              startsInSeconds: secs,
              exam: data.exam || exam,
            });
            setWaitingSecondsLeft(secs);
            setLoading(false);
            return;
          }

          if (data.code === 'ALREADY_SUBMITTED' && data.isTimeout) {
            if (cameraStreamRef.current) {
              cameraStreamRef.current.getTracks().forEach((t) => t.stop());
              cameraStreamRef.current = null;
            }
            if (data.result) {
              setSubmissionResult(data.result);
            }
            setIsTimeout(true);
            setIsSubmitted(true);
            isSubmittedRef.current = true;
            setLoading(false);
            return;
          }

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

        // Initialize authoritative server countdown timer
        if (data.attempt?.deadlineAt) {
          const deadlineMs = new Date(data.attempt.deadlineAt).getTime();
          const serverTimeMs = data.serverTime || data.attempt?.serverTime
            ? new Date(data.serverTime || data.attempt.serverTime).getTime()
            : Date.now();
          const remainingSec = typeof data.attempt?.remainingSeconds === 'number'
            ? data.attempt.remainingSeconds
            : Math.max(0, Math.floor((deadlineMs - serverTimeMs) / 1000));

          serverDeadlineMsRef.current = deadlineMs;
          serverTimeOffsetRef.current = serverTimeMs - Date.now();
          syncMonotonicRef.current = performance.now();
          syncRemainingSecondsRef.current = remainingSec;

          setDeadlineTime(deadlineMs);
          setTimeLeft(remainingSec);
        } else {
          const durationMinutes = data.exam?.durationMinutes || 90;
          const fallbackRemaining = durationMinutes * 60;
          serverDeadlineMsRef.current = Date.now() + fallbackRemaining * 1000;
          serverTimeOffsetRef.current = 0;
          syncMonotonicRef.current = performance.now();
          syncRemainingSecondsRef.current = fallbackRemaining;
          setDeadlineTime(serverDeadlineMsRef.current);
          setTimeLeft(fallbackRemaining);
        }

        // Restore question position: resume at the last saved question or first unanswered question
        let resumeIndex = 0;
        if (data.lastQuestionId && loadedQuestions.length > 0) {
          const foundIdx = loadedQuestions.findIndex((q) => q.id === data.lastQuestionId);
          if (foundIdx !== -1) resumeIndex = foundIdx;
        } else if (data.answers && typeof data.answers === 'object' && Object.keys(data.answers).length > 0 && loadedQuestions.length > 0) {
          const firstUnanswered = loadedQuestions.findIndex(
            (q) => data.answers[q.id] === undefined || data.answers[q.id] === null || data.answers[q.id] === ''
          );
          if (firstUnanswered !== -1) resumeIndex = firstUnanswered;
        }
        setCurrentQuestionIndex(resumeIndex);
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

  // Live ticker for Waiting Room countdown
  useEffect(() => {
    if (!waitingRoomData || waitingSecondsLeft === null) return;
    if (waitingSecondsLeft <= 0) {
      setWaitingRoomData(null);
      window.location.reload();
      return;
    }
    const timer = setInterval(() => {
      setWaitingSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setWaitingRoomData(null);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [waitingRoomData, waitingSecondsLeft]);

  // Automatic Submission on Deadline Timeout
  const handleTimeoutSubmit = useCallback(async () => {
    if (isSubmittingRef.current || isSubmittedRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setIsTimeout(true);

    try {
      // Clear any pending retry timers
      Object.values(retryTimersRef.current).forEach((t) => clearTimeout(t));
      retryTimersRef.current = {};

      const currentAttemptId = attemptIdRef.current || attemptId;
      const response = await fetch(`${API_BASE_URL}/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: selectedAnswersRef.current,
          isTimeout: true,
          attemptId: currentAttemptId,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      if (response.ok || response.status === 200) {
        setSubmissionResult(data.result);
        setIsSubmitted(true);
        isSubmittedRef.current = true;
      } else if (response.status === 403 || data.code === 'ALREADY_SUBMITTED') {
        if (data.result) {
          setSubmissionResult(data.result);
        }
        setIsSubmitted(true);
        isSubmittedRef.current = true;
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
  }, [examId, token, attemptId]);

  // Synchronize timer with authoritative server state
  const syncWithServerTimer = useCallback(async () => {
    if (!token || !examId || isSubmittingRef.current || isSubmittedRef.current || isResyncingTimerRef.current) {
      return;
    }

    isResyncingTimerRef.current = true;
    try {
      const res = await fetch(`${API_BASE_URL}/exams/${examId}/timer`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          handleTimeoutSubmit();
        }
        return;
      }

      const data = await res.json();
      if (data.isExpired || (typeof data.remainingSeconds === 'number' && data.remainingSeconds <= 0)) {
        if (data.result) {
          setSubmissionResult(data.result);
        }
        handleTimeoutSubmit();
        return;
      }

      if (typeof data.remainingSeconds === 'number') {
        const serverTimeMs = new Date(data.serverTime).getTime();
        serverDeadlineMsRef.current = new Date(data.deadlineAt).getTime();
        serverTimeOffsetRef.current = serverTimeMs - Date.now();
        syncMonotonicRef.current = performance.now();
        syncRemainingSecondsRef.current = data.remainingSeconds;

        setTimeLeft(data.remainingSeconds);
      }
    } catch (err) {
      console.warn('Background timer sync check failed:', err);
    } finally {
      isResyncingTimerRef.current = false;
    }
  }, [token, examId, handleTimeoutSubmit]);

  // Countdown Timer Tick Effect (immune to computer clock tampering)
  useEffect(() => {
    if (isSubmitted || loading || error || !deadlineTime) return;

    const tick = () => {
      if (isSubmittedRef.current || isSubmittingRef.current) return;
      if (syncMonotonicRef.current === null || syncRemainingSecondsRef.current === null) return;

      // 1. Monotonic elapsed time calculation (immune to computer clock adjustments)
      const elapsedMonotonicSec = Math.floor((performance.now() - syncMonotonicRef.current) / 1000);
      const monotonicRemaining = Math.max(0, syncRemainingSecondsRef.current - elapsedMonotonicSec);

      // 2. Server-offset wall clock time calculation (detects system suspend/sleep)
      const estimatedServerNow = Date.now() + serverTimeOffsetRef.current;
      const wallRemaining = Math.max(0, Math.floor((serverDeadlineMsRef.current - estimatedServerNow) / 1000));

      // Check for substantial discrepancy (e.g. computer clock jumped or computer slept)
      if (Math.abs(monotonicRemaining - wallRemaining) > 10 && !isResyncingTimerRef.current) {
        syncWithServerTimer();
      }

      // Setting local clock backwards NEVER grants extra time because monotonicRemaining stays accurate
      const remaining = Math.min(monotonicRemaining, wallRemaining);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        handleTimeoutSubmit();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadlineTime, isSubmitted, loading, error, handleTimeoutSubmit, syncWithServerTimer]);

  // Authoritative Proctoring Incident Logging Helper
  const recordProctoringIncident = useCallback(
    async (incidentType, description, extraMetadata = {}) => {
      const currentAttemptId = attemptIdRef.current || attemptId;
      if (!token || !examId || !currentAttemptId || isSubmittedRef.current) return;

      const now = Date.now();
      const lastTime = lastLoggedIncidentRef.current[incidentType] || 0;
      // Client-side debounce of 2.5s to prevent duplicate listener firings
      if (now - lastTime < 2500) {
        return;
      }
      lastLoggedIncidentRef.current[incidentType] = now;

      try {
        await fetch(`${API_BASE_URL}/exams/${examId}/incident`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            attemptId: currentAttemptId,
            type: incidentType,
            description,
            metadata: {
              clientTimestamp: now,
              isElectron: Boolean(window.electronAPI),
              ...extraMetadata,
            },
          }),
        });
      } catch (err) {
        console.warn('Proctoring incident log dispatch warning:', err);
      }
    },
    [token, examId, attemptId]
  );

  // Proctoring Incident Monitoring: Window Blur & Fullscreen Exit
  useEffect(() => {
    if (isSubmitted || loading || error || !attemptId) return;

    let cleanupElectronBlur = null;
    let cleanupElectronFullscreen = null;

    // Window Blur Handler
    const onBlurDetected = () => {
      if (isSubmittedRef.current) return;
      recordProctoringIncident(
        'WINDOW_BLUR',
        'Candidate switched away from the examination window or application lost focus.'
      );
      setProctorWarning({
        type: 'WINDOW_BLUR',
        title: 'Focus Lost Warning',
        message:
          'Athena detected that you switched away from the examination window. This event has been recorded in your proctoring audit log.',
      });
    };

    // Fullscreen Exit Handler
    const onFullscreenExitDetected = () => {
      if (isSubmittedRef.current) return;
      recordProctoringIncident(
        'FULLSCREEN_EXIT',
        'Candidate exited fullscreen mode during active examination session.'
      );
      setProctorWarning({
        type: 'FULLSCREEN_EXIT',
        title: 'Fullscreen Exited Warning',
        message:
          'Athena requires an exclusive fullscreen window. Exiting fullscreen mode has been recorded in your proctoring audit log.',
      });
    };

    // 1. Electron IPC listeners
    if (window.electronAPI) {
      if (typeof window.electronAPI.onWindowBlur === 'function') {
        cleanupElectronBlur = window.electronAPI.onWindowBlur(onBlurDetected);
      }
      if (typeof window.electronAPI.onFullscreenChange === 'function') {
        cleanupElectronFullscreen = window.electronAPI.onFullscreenChange((isFull) => {
          if (!isFull) {
            onFullscreenExitDetected();
          }
        });
      }
    }

    // 2. DOM window, visibility, and fullscreen listeners
    const handleDomBlur = () => {
      onBlurDetected();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onBlurDetected();
      } else if (document.visibilityState === 'visible') {
        syncWithServerTimer();
      }
    };

    const handleDomFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFull) {
        onFullscreenExitDetected();
      }
    };

    const syncInterval = setInterval(() => {
      syncWithServerTimer();
    }, 30000);

    window.addEventListener('blur', handleDomBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleDomFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleDomFullscreenChange);

    return () => {
      clearInterval(syncInterval);
      if (typeof cleanupElectronBlur === 'function') cleanupElectronBlur();
      if (typeof cleanupElectronFullscreen === 'function') cleanupElectronFullscreen();
      window.removeEventListener('blur', handleDomBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleDomFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleDomFullscreenChange);
    };
  }, [isSubmitted, loading, error, attemptId, recordProctoringIncident, syncWithServerTimer]);

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

  // Persistent Save Function with bounded retries, stale-request prevention, and retry queue
  const persistAnswerChange = useCallback(
    async (questionId, { selectedOption, isMarkedForReview }, retryAttempt = 0) => {
      if (!token || !examId) return;

      // Clear any pending retry timer for this question
      if (retryTimersRef.current[questionId]) {
        clearTimeout(retryTimersRef.current[questionId]);
        delete retryTimersRef.current[questionId];
      }

      let currentSeq;
      let clientTimestamp;

      if (retryAttempt === 0) {
        // Increment monotonic sequence number and record timestamp for this question
        currentSeq = (questionSeqRef.current[questionId] || 0) + 1;
        questionSeqRef.current[questionId] = currentSeq;
        clientTimestamp = Date.now();
        questionTimestampRef.current[questionId] = clientTimestamp;

        // Abort any prior in-flight request for this specific question to avoid race conditions
        if (abortControllersRef.current[questionId]) {
          try {
            abortControllersRef.current[questionId].abort();
          } catch (e) {}
        }
      } else {
        currentSeq = questionSeqRef.current[questionId] || 1;
        clientTimestamp = questionTimestampRef.current[questionId] || Date.now();
      }

      const controller = new AbortController();
      abortControllersRef.current[questionId] = controller;

      inFlightCountRef.current += 1;
      setSaveStatus('saving');

      const currentAttemptId = attemptIdRef.current || attemptId;
      const payload = {
        questionId,
        selectedOption,
        isMarkedForReview,
        attemptId: currentAttemptId,
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

          // Re-sync authoritative countdown timer if provided by server
          if (typeof body.remainingSeconds === 'number' && body.serverTime) {
            const serverTimeMs = new Date(body.serverTime).getTime();
            serverTimeOffsetRef.current = serverTimeMs - Date.now();
            syncMonotonicRef.current = performance.now();
            syncRemainingSecondsRef.current = body.remainingSeconds;
            setTimeLeft(body.remainingSeconds);
          }

          if (
            failedOperationsRef.current.size === 0 &&
            inFlightCountRef.current <= 1 &&
            Object.keys(retryTimersRef.current).length === 0
          ) {
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
        } else if (res.status >= 500 || res.status === 429) {
          // Temporary server error -> perform bounded retry with exponential delay
          if (retryAttempt < MAX_AUTOSAVE_RETRIES) {
            const nextRetry = retryAttempt + 1;
            const delay = Math.round(RETRY_BASE_DELAY_MS * Math.pow(1.5, retryAttempt));
            setSaveStatus('saving');
            retryTimersRef.current[questionId] = setTimeout(() => {
              delete retryTimersRef.current[questionId];
              if (questionSeqRef.current[questionId] === currentSeq && !isSubmittedRef.current) {
                persistAnswerChange(questionId, { selectedOption, isMarkedForReview }, nextRetry);
              }
            }, delay);
          } else {
            failedOperationsRef.current.set(questionId, payload);
            setSaveStatus('failed');
            setFailedSaveError(`Server error (${res.status}). Failed to save answer after ${MAX_AUTOSAVE_RETRIES} retries.`);
          }
        } else {
          // Client errors (400, 404, etc.)
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

        // Temporary network failure -> perform bounded retry with exponential delay
        if (retryAttempt < MAX_AUTOSAVE_RETRIES) {
          const nextRetry = retryAttempt + 1;
          const delay = Math.round(RETRY_BASE_DELAY_MS * Math.pow(1.5, retryAttempt));
          setSaveStatus('saving');
          retryTimersRef.current[questionId] = setTimeout(() => {
            delete retryTimersRef.current[questionId];
            if (questionSeqRef.current[questionId] === currentSeq && !isSubmittedRef.current) {
              persistAnswerChange(questionId, { selectedOption, isMarkedForReview }, nextRetry);
            }
          }, delay);
        } else {
          failedOperationsRef.current.set(questionId, payload);
          setSaveStatus('failed');
          setFailedSaveError(`Network connection interrupted. Save failed after ${MAX_AUTOSAVE_RETRIES} attempts.`);
        }
      } finally {
        inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
        if (failedOperationsRef.current.size > 0) {
          setSaveStatus('failed');
        } else if (inFlightCountRef.current === 0 && Object.keys(retryTimersRef.current).length === 0) {
          setSaveStatus('saved');
        }
      }
    },
    [token, examId, attemptId, handleTimeoutSubmit]
  );

  // Retry all failed saves in the queue
  const retryFailedSaves = useCallback(() => {
    // Clear any pending retry timers
    Object.values(retryTimersRef.current).forEach((t) => clearTimeout(t));
    retryTimersRef.current = {};

    if (failedOperationsRef.current.size === 0) return;
    const opsToRetry = Array.from(failedOperationsRef.current.entries());
    failedOperationsRef.current.clear();
    setFailedSaveError(null);
    setSubmitError(null);

    opsToRetry.forEach(([qId, payload]) => {
      persistAnswerChange(
        qId,
        {
          selectedOption: payload.selectedOption,
          isMarkedForReview: payload.isMarkedForReview,
        },
        0
      );
    });
  }, [persistAnswerChange]);

  // Handle single-option answer selection associated with the question ID
  const handleSelectOption = useCallback(
    (questionId, optionIndex) => {
      if (isSubmittingRef.current || isSubmittedRef.current || timeLeft === 0) return;

      // Clear any pending retry timer for this question
      if (retryTimersRef.current[questionId]) {
        clearTimeout(retryTimersRef.current[questionId]);
        delete retryTimersRef.current[questionId];
      }

      setSelectedAnswers((prev) => ({
        ...prev,
        [questionId]: optionIndex,
      }));

      // Persist answer choice to backend PostgreSQL
      persistAnswerChange(
        questionId,
        {
          selectedOption: optionIndex,
          isMarkedForReview: Boolean(flaggedQuestions[questionId]),
        },
        0
      );
    },
    [timeLeft, flaggedQuestions, persistAnswerChange]
  );

  // Handle Clear Answer for a question (or current question)
  const handleClearAnswer = useCallback(
    (questionId) => {
      if (!questionId || isSubmittingRef.current || isSubmittedRef.current || timeLeft === 0) return;

      if (retryTimersRef.current[questionId]) {
        clearTimeout(retryTimersRef.current[questionId]);
        delete retryTimersRef.current[questionId];
      }

      setSelectedAnswers((prev) => {
        if (prev[questionId] === undefined) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });

      // Persist cleared answer (selectedOption = null) to PostgreSQL
      persistAnswerChange(
        questionId,
        {
          selectedOption: null,
          isMarkedForReview: Boolean(flaggedQuestions[questionId]),
        },
        0
      );
    },
    [timeLeft, flaggedQuestions, persistAnswerChange]
  );

  // Handle Toggle Review Flag for a question (or current question)
  const handleToggleFlag = useCallback(
    (questionId) => {
      if (!questionId || isSubmittingRef.current || isSubmittedRef.current || timeLeft === 0) return;

      if (retryTimersRef.current[questionId]) {
        clearTimeout(retryTimersRef.current[questionId]);
        delete retryTimersRef.current[questionId];
      }

      const nextFlag = !flaggedQuestions[questionId];

      setFlaggedQuestions((prev) => ({
        ...prev,
        [questionId]: nextFlag,
      }));

      // Persist review flag to backend PostgreSQL
      persistAnswerChange(
        questionId,
        {
          selectedOption: selectedAnswers[questionId] !== undefined ? selectedAnswers[questionId] : null,
          isMarkedForReview: nextFlag,
        },
        0
      );
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
    setSubmitError(null);
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
    setSubmitError(null);

    try {
      // 1. Immediately flush any scheduled retry timers
      const activeTimers = Object.entries(retryTimersRef.current);
      if (activeTimers.length > 0) {
        activeTimers.forEach(([qId, timerId]) => {
          clearTimeout(timerId);
          delete retryTimersRef.current[qId];
          const lastAns = selectedAnswersRef.current[qId];
          const isFlagged = Boolean(flaggedQuestionsRef.current[qId]);
          persistAnswerChange(
            qId,
            {
              selectedOption: lastAns !== undefined ? lastAns : null,
              isMarkedForReview: isFlagged,
            },
            MAX_AUTOSAVE_RETRIES
          );
        });
      }

      // 2. Wait for all in-flight answer saves to complete (up to 3.5s timeout)
      const startWait = Date.now();
      while (inFlightCountRef.current > 0 && Date.now() - startWait < 3500) {
        await new Promise((r) => setTimeout(r, 100));
      }

      // 3. Before submitting, verify that all answer changes have been successfully persisted
      if (failedOperationsRef.current.size > 0) {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        setSubmitError(
          `Cannot submit examination: ${failedOperationsRef.current.size} answer change(s) failed to save. Please retry saving before submitting.`
        );
        return;
      }

      // 4. Submit assessment with final answers and target attemptId
      const currentAttemptId = attemptIdRef.current || attemptId;
      const response = await fetch(`${API_BASE_URL}/exams/${examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: selectedAnswersRef.current,
          isTimeout: false,
          attemptId: currentAttemptId,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      if (response.ok || (data.message && data.result)) {
        setSubmissionResult(data.result);
        setIsSubmitted(true);
        isSubmittedRef.current = true;
        setShowSubmitModal(false);
      } else if (response.status === 403 || data.code === 'ALREADY_SUBMITTED') {
        if (data.result) {
          setSubmissionResult(data.result);
        }
        setIsSubmitted(true);
        isSubmittedRef.current = true;
        setShowSubmitModal(false);
      } else {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
        setSubmitError(data.message || 'Submission failed. Please check network connection and try again.');
      }
    } catch (err) {
      console.error('Submit exam error:', err);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setSubmitError('Unable to submit exam due to a network error. Please try again.');
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

  // --- STATE 1.5: SCHEDULED WAITING ROOM (Future Exam) ---
  if (waitingRoomData && waitingSecondsLeft !== null) {
    const hours = Math.floor(waitingSecondsLeft / 3600);
    const mins = Math.floor((waitingSecondsLeft % 3600) / 60);
    const secs = waitingSecondsLeft % 60;
    const formattedDigits =
      hours > 0
        ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    return (
      <div className="exam-room-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="waiting-room-hero">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              borderRadius: '999px',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#a5b4fc',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            <Clock size={14} className="pulse-amber" />
            <span>EXAMINATION WAITING ROOM • PROCTORING TELEMETRY READY</span>
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
            {waitingRoomData.exam?.title || 'Scheduled Assessment'}
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              maxWidth: '520px',
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            Your workstation and proctoring telemetry are verified. Please stay on this screen in fullscreen mode.
            Your examination session will unlock and start automatically when the timer reaches zero.
          </p>

          <div className="waiting-room-timer-display">
            <Clock size={28} color="#38bdf8" />
            <div className="waiting-room-timer-digits">{formattedDigits}</div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginTop: '16px',
            }}
          >
            <button
              onClick={() => {
                if (window.electronAPI && typeof window.electronAPI.setFullscreen === 'function') {
                  window.electronAPI.setFullscreen(false).catch(() => {});
                }
                navigate('/dashboard');
              }}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={14} />
              <span>Return to Dashboard</span>
            </button>
          </div>
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
            This examination has not yet been loaded with assessment questions. Please contact your examination proctor or coordinator.
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

          {/* Submission Result Overview */}
          {submissionResult && submissionResult.percentage !== undefined && (
            <div style={{ marginBottom: '20px' }}>
              <div
                className="status-pill"
                style={{
                  background: submissionResult.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderColor: submissionResult.passed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                  color: submissionResult.passed ? '#34d399' : '#f87171',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  padding: '5px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '999px',
                  border: '1px solid',
                }}
              >
                {submissionResult.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>
                  {submissionResult.passed
                    ? `Passed (${submissionResult.percentage}%)`
                    : `Did Not Meet 40% Threshold (${submissionResult.percentage}%)`}
                </span>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: '10px',
              padding: '16px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Score</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#a5b4fc', marginTop: '4px' }}>
                {submissionResult?.score !== undefined ? `${submissionResult.score}/${submissionResult.totalMarks || 100}` : 'Recorded'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: '#34d399', textTransform: 'uppercase', fontWeight: 600 }}>Correct</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                {submissionResult?.correctCount !== undefined ? submissionResult.correctCount : '-'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: '#f87171', textTransform: 'uppercase', fontWeight: 600 }}>Wrong</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>
                {submissionResult?.wrongCount !== undefined ? submissionResult.wrongCount : '-'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Skipped</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>
                {submissionResult?.unansweredCount !== undefined ? submissionResult.unansweredCount : '-'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12.5px', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '10px 14px', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(239, 68, 68, 0.25)', marginBottom: '24px' }}>
            Athena Single-Attempt Rule: You cannot re-enter or retake this examination.
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {(attemptIdRef.current || attemptId) && (
              <button
                onClick={() => {
                  if (window.electronAPI && typeof window.electronAPI.setFullscreen === 'function') {
                    window.electronAPI.setFullscreen(false).catch(() => {});
                  }
                  navigate(`/results/${attemptIdRef.current || attemptId}`);
                }}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FileCheck size={15} />
                <span>Review Question Answers</span>
              </button>
            )}

            <button
              onClick={() => {
                if (window.electronAPI && typeof window.electronAPI.setFullscreen === 'function') {
                  window.electronAPI.setFullscreen(false).catch(() => {});
                }
                navigate('/dashboard', { state: { tab: 'history' } });
              }}
              className="btn btn-secondary"
            >
              <ArrowLeft size={14} />
              <span>Return to Dashboard</span>
            </button>
          </div>
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

            {submitError && (
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
                  <span>{submitError}</span>
                </div>
                {failedOperationsRef.current.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      retryFailedSaves();
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', background: 'rgba(255, 255, 255, 0.15)' }}
                  >
                    Retry Now
                  </button>
                )}
              </div>
            )}

            {!submitError && failedOperationsRef.current.size > 0 && (
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

      {/* Proctoring Warning Modal */}
      {proctorWarning && (
        <div
          id="proctor-warning-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 7, 10, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: '#131822',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(239, 68, 68, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  {proctorWarning.title}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                    color: '#ef4444',
                  }}
                >
                  Proctoring Event Recorded
                </span>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '24px' }}>
              {proctorWarning.message}
            </p>

            <div
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '24px',
                fontSize: '12px',
                color: '#cbd5e1',
              }}
            >
              Please remain in the exam window and stay in fullscreen mode until your test is concluded. All focus interruptions are timestamped in the proctoring audit log.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                id="btn-dismiss-proctor-warning"
                onClick={() => {
                  if (proctorWarning.type === 'FULLSCREEN_EXIT') {
                    if (window.electronAPI && typeof window.electronAPI.setFullscreen === 'function') {
                      window.electronAPI.setFullscreen(true);
                    } else if (document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }
                  }
                  setProctorWarning(null);
                }}
                className="btn btn-primary"
                style={{
                  background: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#ffffff',
                }}
              >
                <span>Acknowledge & Return to Exam</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
