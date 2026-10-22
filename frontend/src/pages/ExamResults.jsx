import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Clock,
  Award,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  FileCheck,
  HelpCircle,
} from 'lucide-react';
import './pages.css';
import { API_BASE_URL } from '../config';


export default function ExamResults() {
  const { attemptId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [filter, setFilter] = useState('all'); // 'all' | 'correct' | 'wrong' | 'unanswered'

  const fetchDetailedResult = useCallback(async () => {
    if (!attemptId) {
      setError({ message: 'No examination attempt identifier was provided.', code: 'MISSING_ATTEMPT_ID' });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/exams/results/${attemptId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Unable to retrieve examination result details.');
      }

      setResultData(data);
      setSelectedQuestionIndex(0);
    } catch (err) {
      console.error('Fetch detailed result error:', err);
      setError({
        message: err.message || 'Failed to communicate with assessment server.',
        code: 'NETWORK_ERROR',
      });
    } finally {
      setLoading(false);
    }
  }, [attemptId, token]);

  useEffect(() => {
    fetchDetailedResult();
  }, [fetchDetailedResult]);

  // Keyboard navigation between questions
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!resultData || !resultData.questions || resultData.questions.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'KeyJ') {
        setSelectedQuestionIndex((prev) => Math.min(resultData.questions.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'KeyK') {
        setSelectedQuestionIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resultData]);

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
            }}
          >
            <RotateCcw size={20} className="spin" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#f3f5f8' }}>
            Loading Authoritative Examination Results...
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Retrieving persisted grading evaluation from secure database
          </div>
        </div>
      </div>
    );
  }

  // Error state (Unauthorized, Not Found, Network)
  if (error || !resultData) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          padding: '24px',
        }}
      >
        <div
          className="surface-card"
          style={{
            maxWidth: '520px',
            width: '100%',
            padding: '36px 30px',
            textAlign: 'center',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              color: '#ef4444',
            }}
          >
            <AlertTriangle size={26} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f3f5f8', marginBottom: '8px' }}>
            Unable to Access Assessment Result
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
            {error?.message || 'The requested examination result could not be found or you do not have permission to view it.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/dashboard', { state: { tab: 'history' } })}
              className="btn btn-primary"
            >
              <ArrowLeft size={14} />
              <span>Return to Past Results</span>
            </button>
            <button
              onClick={fetchDetailedResult}
              className="btn btn-secondary"
            >
              <RotateCcw size={14} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    examTitle,
    examCode,
    department,
    submittedAt,
    score,
    totalMarks,
    percentage,
    passed,
    correctCount,
    wrongCount,
    unansweredCount,
    negativeMarking = 0,
    questions = [],
  } = resultData;

  const formattedDate = submittedAt
    ? new Date(submittedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Completed Session';

  // Filter questions for display
  const filteredQuestions = questions.filter((q) => {
    if (filter === 'correct') return q.isCorrect;
    if (filter === 'wrong') return q.isAnswered && !q.isCorrect;
    if (filter === 'unanswered') return !q.isAnswered;
    return true;
  });

  const currentQuestion = questions[selectedQuestionIndex] || questions[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', paddingBottom: '60px' }}>
      {/* TOP HEADER BAR */}
      <header
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => navigate('/dashboard', { state: { tab: 'history' } })}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={13} />
            <span>Dashboard</span>
          </button>
          <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="font-mono exam-code-tag">{examCode}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f3f5f8' }}>
              {examTitle} • Assessment Evaluation Report
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={fetchDetailedResult}
            className="btn btn-secondary btn-sm"
            title="Refresh Result"
          >
            <RotateCcw size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1120px', margin: '28px auto 0', padding: '0 24px' }}>
        {/* EXECUTIVE RESULTS SUMMARY CARD */}
        <div className="surface-card" style={{ padding: '28px 32px', marginBottom: '28px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '20px',
              marginBottom: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span className="font-mono exam-code-tag">{examCode}</span>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {department || 'Department of Computer Science & Engineering'}
                </span>
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                {examTitle}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                <Clock size={13} />
                <span>Submitted on {formattedDate}</span>
                <span>•</span>
                <span>Authoritative Server-Graded Record</span>
              </div>
            </div>

            {/* STATUS BADGE */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <div
                className="status-pill"
                style={{
                  background: passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderColor: passed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                  color: passed ? '#34d399' : '#f87171',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '6px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '999px',
                  border: '1px solid',
                }}
              >
                {passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span>{passed ? 'Passed Examination' : 'Did Not Meet Minimum Threshold'}</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Passing Benchmark: 40.0% Minimum Score
              </span>
            </div>
          </div>

          {/* METRICS GRID */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Score */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 18px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Score Obtained
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
                <span style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                  {score}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/ {totalMarks}</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Marks Awarded
              </div>
            </div>

            {/* Grade Percentage */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 18px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Grade Percentage
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
                <span style={{ fontSize: '26px', fontWeight: 800, color: passed ? '#34d399' : '#f87171', fontFamily: 'var(--font-mono)' }}>
                  {percentage}%
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Overall Accuracy
              </div>
            </div>

            {/* Correct Answers */}
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                <CheckCircle2 size={13} />
                <span>Correct Answers</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                {correctCount}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Out of {questions.length} questions
              </div>
            </div>

            {/* Wrong Answers */}
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                <XCircle size={13} />
                <span>Incorrect Answers</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                {wrongCount}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {negativeMarking > 0 ? `-${negativeMarking} mark per wrong` : 'No penalty applied'}
              </div>
            </div>

            {/* Unanswered */}
            <div
              style={{
                background: 'rgba(148, 163, 184, 0.05)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                <MinusCircle size={13} />
                <span>Unanswered</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                {unansweredCount}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Skipped (0 penalty)
              </div>
            </div>

            {/* Proctoring Telemetry */}
            <div
              style={{
                background: (resultData.incidents && resultData.incidents.length > 0) ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                border: (resultData.incidents && resultData.incidents.length > 0) ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: (resultData.incidents && resultData.incidents.length > 0) ? '#f87171' : '#34d399', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                {(resultData.incidents && resultData.incidents.length > 0) ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                <span>Proctoring Telemetry</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                {resultData.incidents ? resultData.incidents.length : 0}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {(resultData.incidents && resultData.incidents.length > 0) ? 'Recorded Focus Events' : 'Clean Session (0 Flags)'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION HEADER: QUESTION-BY-QUESTION ANSWER REVIEW */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCheck size={18} color="#a5b4fc" />
              <span>Detailed Question & Answer Review</span>
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Review your submitted responses alongside authoritative answer keys and score outcomes.
            </p>
          </div>

          {/* FILTER CHIPS */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setFilter('all')}
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              All ({questions.length})
            </button>
            <button
              onClick={() => setFilter('correct')}
              className={`btn btn-sm ${filter === 'correct' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                color: filter === 'correct' ? '#090a0f' : '#34d399',
              }}
            >
              Correct ({correctCount})
            </button>
            <button
              onClick={() => setFilter('wrong')}
              className={`btn btn-sm ${filter === 'wrong' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                color: filter === 'wrong' ? '#090a0f' : '#f87171',
              }}
            >
              Incorrect ({wrongCount})
            </button>
            <button
              onClick={() => setFilter('unanswered')}
              className={`btn btn-sm ${filter === 'unanswered' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                color: filter === 'unanswered' ? '#090a0f' : '#94a3b8',
              }}
            >
              Unanswered ({unansweredCount})
            </button>
          </div>
        </div>

        {/* QUESTION SELECTOR PALETTE */}
        <div
          className="surface-card"
          style={{
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px', textTransform: 'uppercase' }}>
            Jump to:
          </span>
          {questions.map((q, idx) => {
            const isSelected = idx === selectedQuestionIndex;
            let bgColor = 'rgba(148, 163, 184, 0.08)';
            let borderColor = 'rgba(148, 163, 184, 0.25)';
            let textColor = '#94a3b8';

            if (q.isCorrect) {
              bgColor = 'rgba(16, 185, 129, 0.12)';
              borderColor = 'rgba(16, 185, 129, 0.35)';
              textColor = '#34d399';
            } else if (q.isAnswered) {
              bgColor = 'rgba(239, 68, 68, 0.12)';
              borderColor = 'rgba(239, 68, 68, 0.35)';
              textColor = '#f87171';
            }

            return (
              <button
                key={q.id || idx}
                onClick={() => setSelectedQuestionIndex(idx)}
                style={{
                  minWidth: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? '2px solid #6366f1' : `1px solid ${borderColor}`,
                  background: isSelected ? '#1e1b4b' : bgColor,
                  color: isSelected ? '#ffffff' : textColor,
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none',
                }}
                title={`Question ${idx + 1}: ${q.isCorrect ? 'Correct' : q.isAnswered ? 'Incorrect' : 'Unanswered'}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* ACTIVE QUESTION REVIEW CARD */}
        {currentQuestion && (
          <div className="surface-card" style={{ padding: '32px 36px', marginBottom: '24px' }}>
            {/* CARD TOP META */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '18px',
                marginBottom: '22px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#ffffff',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-default)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-xs)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Question {selectedQuestionIndex + 1} of {questions.length}
                </span>

                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Marks: {currentQuestion.marks}
                </span>
              </div>

              {/* EVALUATION OUTCOME PILL */}
              <div>
                {currentQuestion.isCorrect ? (
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#34d399',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <CheckCircle2 size={13} />
                    <span>Correct (+{currentQuestion.marksAwarded} Marks)</span>
                  </div>
                ) : currentQuestion.isAnswered ? (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <XCircle size={13} />
                    <span>Incorrect ({currentQuestion.marksAwarded} Marks)</span>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'rgba(148, 163, 184, 0.1)',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      color: '#94a3b8',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <MinusCircle size={13} />
                    <span>Unanswered / Skipped (0 Marks)</span>
                  </div>
                )}
              </div>
            </div>

            {/* QUESTION TEXT */}
            <div style={{ fontSize: '16.5px', fontWeight: 600, color: '#ffffff', lineHeight: 1.5, marginBottom: '24px' }}>
              {currentQuestion.text}
            </div>

            {/* STATUS CALLOUT BANNER */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '24px',
                fontSize: '13px',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: currentQuestion.isCorrect
                  ? 'rgba(16, 185, 129, 0.08)'
                  : currentQuestion.isAnswered
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'rgba(148, 163, 184, 0.08)',
                border: currentQuestion.isCorrect
                  ? '1px solid rgba(16, 185, 129, 0.25)'
                  : currentQuestion.isAnswered
                  ? '1px solid rgba(239, 68, 68, 0.25)'
                  : '1px solid rgba(148, 163, 184, 0.2)',
                color: currentQuestion.isCorrect
                  ? '#34d399'
                  : currentQuestion.isAnswered
                  ? '#f87171'
                  : '#94a3b8',
              }}
            >
              {currentQuestion.isCorrect ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>Your submitted response was correct and earned full marks for this question.</span>
                </>
              ) : currentQuestion.isAnswered ? (
                <>
                  <XCircle size={16} />
                  <span>
                    Your submitted response was incorrect.{' '}
                    {negativeMarking > 0 && `A negative marking deduction of ${negativeMarking} marks was applied.`}
                  </span>
                </>
              ) : (
                <>
                  <HelpCircle size={16} />
                  <span>You did not provide an answer for this question. No score deduction was applied.</span>
                </>
              )}
            </div>

            {/* OPTIONS LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {Array.isArray(currentQuestion.options) &&
                currentQuestion.options.map((optionText, optIdx) => {
                  const optionLabel = String.fromCharCode(65 + optIdx); // 'A', 'B', 'C', 'D'
                  const isCandidateChoice =
                    currentQuestion.selectedOptionIndex === optIdx ||
                    String(currentQuestion.selectedOption) === String(optIdx) ||
                    String(currentQuestion.selectedOption) === String(optionText);

                  const isCorrectChoice =
                    currentQuestion.correctOptionIndex === optIdx ||
                    String(currentQuestion.correctAnswer) === String(optIdx) ||
                    String(currentQuestion.correctAnswer) === String(optionText);

                  // Styling logic
                  let cardBg = 'rgba(15, 23, 42, 0.4)';
                  let cardBorder = 'var(--border-subtle)';
                  let badge = null;

                  if (isCandidateChoice && isCorrectChoice) {
                    // Correct answer chosen by candidate
                    cardBg = 'rgba(16, 185, 129, 0.12)';
                    cardBorder = 'rgba(16, 185, 129, 0.5)';
                    badge = (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.2)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        Your Answer (Correct)
                      </span>
                    );
                  } else if (isCandidateChoice && !isCorrectChoice) {
                    // Incorrect answer chosen by candidate
                    cardBg = 'rgba(239, 68, 68, 0.12)';
                    cardBorder = 'rgba(239, 68, 68, 0.5)';
                    badge = (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#f87171',
                          background: 'rgba(239, 68, 68, 0.2)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                        }}
                      >
                        Your Answer (Incorrect)
                      </span>
                    );
                  } else if (isCorrectChoice) {
                    // Authoritative correct answer
                    cardBg = 'rgba(16, 185, 129, 0.08)';
                    cardBorder = 'rgba(16, 185, 129, 0.4)';
                    badge = (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.15)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        Authoritative Correct Answer
                      </span>
                    );
                  }

                  return (
                    <div
                      key={optIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        borderRadius: 'var(--radius-sm)',
                        background: cardBg,
                        border: `1px solid ${cardBorder}`,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            background: isCandidateChoice
                              ? isCorrectChoice
                                ? '#10b981'
                                : '#ef4444'
                              : isCorrectChoice
                              ? 'rgba(16, 185, 129, 0.3)'
                              : 'var(--bg-surface-elevated)',
                            color: isCandidateChoice
                              ? '#ffffff'
                              : isCorrectChoice
                              ? '#34d399'
                              : 'var(--text-secondary)',
                            border: isCorrectChoice || isCandidateChoice
                              ? 'none'
                              : '1px solid var(--border-default)',
                          }}
                        >
                          {optionLabel}
                        </div>

                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: isCandidateChoice || isCorrectChoice ? 600 : 400,
                            color: isCandidateChoice || isCorrectChoice ? '#ffffff' : 'var(--text-secondary)',
                          }}
                        >
                          {optionText}
                        </span>
                      </div>

                      {badge && <div>{badge}</div>}
                    </div>
                  );
                })}
            </div>

            {/* EXPLANATION SECTION (Only rendered if explanation exists in question data) */}
            {currentQuestion.explanation && String(currentQuestion.explanation).trim() !== '' && (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px 20px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', marginBottom: '6px' }}>
                  <BookOpen size={14} />
                  <span>Answer Rationale & Explanation</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {currentQuestion.explanation}
                </div>
              </div>
            )}

            {/* QUESTION PAGINATION FOOTER */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '20px',
              }}
            >
              <button
                onClick={() => setSelectedQuestionIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedQuestionIndex === 0}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ChevronLeft size={14} />
                <span>Previous Question</span>
              </button>

              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {selectedQuestionIndex + 1} of {questions.length} Questions
              </span>

              <button
                onClick={() => setSelectedQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                disabled={selectedQuestionIndex === questions.length - 1}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>Next Question</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* PROCTORING AUDIT LOG SECTION */}
        <div
          id="proctoring-audit-section"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '24px 28px',
            marginTop: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: (resultData.incidents && resultData.incidents.length > 0) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  border: (resultData.incidents && resultData.incidents.length > 0) ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(34, 197, 94, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: (resultData.incidents && resultData.incidents.length > 0) ? '#ef4444' : '#22c55e',
                }}
              >
                {(resultData.incidents && resultData.incidents.length > 0) ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Proctoring Incident Audit Trail
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Server-timestamped log of window focus and screen mode events
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '9999px',
                background: (resultData.incidents && resultData.incidents.length > 0) ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                color: (resultData.incidents && resultData.incidents.length > 0) ? '#f87171' : '#4ade80',
                border: (resultData.incidents && resultData.incidents.length > 0) ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(34, 197, 94, 0.2)',
              }}
            >
              {(resultData.incidents && resultData.incidents.length > 0)
                ? `${resultData.incidents.length} Incident${resultData.incidents.length === 1 ? '' : 's'} Recorded`
                : 'Clean Session · No Incidents Recorded'}
            </span>
          </div>

          {resultData.incidents && resultData.incidents.length > 0 ? (
            <div>
              {/* Category Breakdown & Telemetry Notice */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 18px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '6px' }}>
                    Incident Breakdown by Category
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Object.entries(
                      resultData.incidents.reduce((acc, inc) => {
                        acc[inc.type] = (acc[inc.type] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([type, count]) => {
                      const label =
                        type === 'WINDOW_BLUR'
                          ? 'Window Blur / Focus Lost'
                          : type === 'FULLSCREEN_EXIT'
                          ? 'Fullscreen Exited'
                          : type.replace(/_/g, ' ');
                      return (
                        <span
                          key={type}
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#fca5a5',
                          }}
                        >
                          {label}: {count}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.4 }}>
                  Athena automated focus logs serve as an audit trail for proctoring review. Candidates are evaluated on academic merit, and focus interruptions do not apply automated scoring penalties.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {resultData.incidents.map((incident, idx) => {
                  const eventTime = new Date(incident.occurredAt);
                  const formattedTime = !isNaN(eventTime.getTime())
                    ? eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : 'Time unavailable';
                  const formattedDate = !isNaN(eventTime.getTime())
                    ? eventTime.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                    : '';

                  const incidentLabel =
                    incident.type === 'WINDOW_BLUR'
                      ? 'Window Blur / Tab Switch'
                      : incident.type === 'FULLSCREEN_EXIT'
                      ? 'Exited Fullscreen Mode'
                      : incident.type.replace(/_/g, ' ');

                  return (
                    <div
                      key={incident.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        background: 'rgba(15, 23, 42, 0.4)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 16px',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <AlertTriangle size={16} color="#f87171" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                              {incidentLabel}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                textTransform: 'uppercase',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#fca5a5',
                              }}
                            >
                              {incident.type}
                            </span>
                          </div>
                          {(incident.description || incident.details) && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                              {incident.description || incident.details}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {formattedTime}
                        </div>
                        {formattedDate && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {formattedDate}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              The candidate maintained continuous exam window focus and exclusive fullscreen mode throughout this assessment session.
            </p>
          )}
        </div>

        {/* BOTTOM RETURN ACTIONS */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '32px' }}>
          <button
            onClick={() => navigate('/dashboard', { state: { tab: 'history' } })}
            className="btn btn-primary"
            style={{ padding: '12px 24px', fontSize: '13.5px' }}
          >
            <ArrowLeft size={15} />
            <span>Return to Past Results</span>
          </button>
        </div>
      </main>
    </div>
  );
}
