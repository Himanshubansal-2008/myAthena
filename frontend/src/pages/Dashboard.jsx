import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context.jsx';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  FileText,
  LogOut,
  ArrowRight,
  CheckCircle2,
  Lock,
  Clock,
  RotateCcw,
  FileCheck,
} from 'lucide-react';
import './pages.css';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(location.state?.tab || 'exams'); // 'exams' | 'history'
  const [pastResults, setPastResults] = useState([]);
  const [backendExams, setBackendExams] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state?.tab]);

  const fetchExamsAndResults = useCallback(async () => {
    if (!token) return;
    setLoadingResults(true);
    try {
      const [resultsRes, examsRes, activeSessionRes] = await Promise.all([
        fetch('http://localhost:5050/api/exams/results/my-results', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('http://localhost:5050/api/exams', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('http://localhost:5050/api/exams/session/active', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();
        setPastResults(resultsData.results || []);
      }

      if (examsRes.ok) {
        const examsData = await examsRes.json();
        setBackendExams(examsData.exams || []);
      }

      if (activeSessionRes && activeSessionRes.ok) {
        const sessionData = await activeSessionRes.json();
        setActiveSession(sessionData.hasActiveSession ? sessionData.session : null);
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    } finally {
      setLoadingResults(false);
    }
  }, [token]);

  useEffect(() => {
    fetchExamsAndResults();
  }, [fetchExamsAndResults, activeTab]);

  const handleResumeExam = (examId) => {
    const targetExam =
      backendExams.find((e) => (e.id || '').toLowerCase() === (examId || '').toLowerCase()) ||
      examinations.find((e) => (e.id || '').toLowerCase() === (examId || '').toLowerCase()) ||
      { id: examId };

    navigate(`/exam/${examId}`, { state: { exam: targetExam, resume: true } });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const examinations = [
    {
      id: 'cs-401',
      code: 'CS-401',
      title: 'Advanced Computer Networks & Distributed Systems',
      department: 'Department of Computer Science & Engineering',
      type: 'End-Term Comprehensive Exam',
      durationMinutes: 90,
      totalQuestions: 50,
      totalMarks: 100,
      negativeMarking: '0.25 penalty per wrong answer',
      status: 'AVAILABLE_NOW',
      windowTime: 'Available today until 11:59 PM',
    },
    {
      id: 'cs-302',
      code: 'CS-302',
      title: 'Design & Analysis of Algorithms',
      department: 'Department of Computer Science & Engineering',
      type: 'Mid-Term Assessment',
      durationMinutes: 120,
      totalQuestions: 40,
      totalMarks: 100,
      negativeMarking: 'No negative marking',
      status: 'AVAILABLE_NOW',
      windowTime: 'Available today until 11:59 PM',
    },
    {
      id: 'se-204',
      code: 'SE-204',
      title: 'Operating Systems & Concurrency Architecture',
      department: 'Software Engineering Division',
      type: 'Module Assessment 2',
      durationMinutes: 75,
      totalQuestions: 35,
      totalMarks: 75,
      negativeMarking: '0.33 penalty per wrong answer',
      status: 'UPCOMING',
      windowTime: 'Scheduled for tomorrow, 10:00 AM IST',
    },
  ];

  // Helper: check if an exam has been completed / submitted by current user
  const isCompletedExam = useCallback(
    (exam) => {
      const examIdLower = (exam?.id || '').toLowerCase();
      const examCodeLower = (exam?.code || '').toLowerCase();

      const inPastResults = pastResults.some((r) => {
        const rExamId = (r.examId || '').toLowerCase();
        const rExamCode = (r.examCode || '').toLowerCase();
        return rExamId === examIdLower || rExamCode === examCodeLower || rExamCode === examIdLower;
      });
      if (inPastResults) return true;

      const backendExam = backendExams.find(
        (e) => (e.id || '').toLowerCase() === examIdLower
      );
      if (
        backendExam?.attempt?.isSubmitted ||
        backendExam?.attempt?.status === 'SUBMITTED' ||
        backendExam?.attempt?.status === 'AUTO_SUBMITTED'
      ) {
        return true;
      }

      return false;
    },
    [pastResults, backendExams]
  );

  const upcomingExams = examinations.filter((exam) => !isCompletedExam(exam));

  return (
    <div className="dashboard-root">
      {/* Left Application Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-box">
            <div className="sidebar-brand-icon">
              <Shield size={18} />
            </div>
            <div className="sidebar-brand-info">
              <span className="sidebar-brand-title">ATHENA</span>
              <span className="sidebar-brand-subtitle">Examination Portal</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button
              onClick={() => setActiveTab('exams')}
              className={`sidebar-nav-item ${activeTab === 'exams' ? 'active' : ''}`}
            >
              <div className="sidebar-nav-left">
                <Shield size={16} />
                <span>Assessments</span>
              </div>
              <span className="sidebar-nav-badge">{upcomingExams.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
            >
              <div className="sidebar-nav-left">
                <FileText size={16} />
                <span>Past Results</span>
              </div>
              {pastResults.length > 0 && (
                <span className="sidebar-nav-badge">{pastResults.length}</span>
              )}
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">
              {user?.name ? user.name[0].toUpperCase() : 'C'}
            </div>
            <div className="sidebar-user-details">
              <div className="sidebar-user-name">
                {user?.name || 'Himanshu Bansal'}
              </div>
              <div className="sidebar-user-email">
                {user?.email || 'student@athena.local'}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-secondary sidebar-signout-btn"
            title="Log out of Athena"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main">
        <main className="dashboard-content">
          {/* TAB 1: UPCOMING ASSESSMENTS */}
          {activeTab === 'exams' && (
            <div>
              <div className="dashboard-top-row">
                <div>
                  <h1 className="dashboard-page-title">
                    Scheduled Examinations
                  </h1>
                  <p className="dashboard-page-desc">
                    Active evaluation sessions assigned to your academic profile.
                  </p>
                </div>
              </div>

              {activeSession && (
                <div className="surface-card dashboard-resume-banner" id="dashboard-active-session-banner">
                  <div className="dashboard-resume-info">
                    <div className="dashboard-resume-icon-box">
                      <Clock size={20} className="pulse-amber" />
                    </div>
                    <div>
                      <div className="dashboard-resume-tag">
                        <span className="status-dot status-dot-amber"></span>
                        INTERRUPTED SESSION DETECTED
                      </div>
                      <h3 className="dashboard-resume-title">
                        {activeSession.examCode}: {activeSession.examTitle}
                      </h3>
                      <p className="dashboard-resume-subtitle">
                        Progress saved ({activeSession.answeredCount} answered of {activeSession.totalQuestions} questions) •{' '}
                        {Math.floor(activeSession.remainingSeconds / 60)}m {activeSession.remainingSeconds % 60}s remaining
                      </p>
                    </div>
                  </div>
                  <div className="dashboard-resume-actions">
                    <button
                      id="btn-resume-exam-banner"
                      onClick={() => handleResumeExam(activeSession.examId)}
                      className="btn btn-warning btn-resume-banner"
                    >
                      <RotateCcw size={14} />
                      <span>Resume Exam</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {upcomingExams.length === 0 ? (
                <div className="surface-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      color: '#34d399',
                    }}
                  >
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f5f8', marginBottom: '6px' }}>
                    All Scheduled Assessments Completed
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px' }}>
                    You have completed all scheduled examinations for your profile. Your submissions are recorded in Past Results.
                  </p>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="btn btn-secondary btn-sm"
                  >
                    View Past Results
                  </button>
                </div>
              ) : (
                <div className="exam-card-list">
                  {upcomingExams.map((exam) => {
                    const isLive = exam.status === 'AVAILABLE_NOW';
                    const isResumable =
                      (activeSession && (activeSession.examId || '').toLowerCase() === (exam.id || '').toLowerCase()) ||
                      (() => {
                        const be = backendExams.find((e) => (e.id || '').toLowerCase() === (exam.id || '').toLowerCase());
                        return be?.attempt?.isInProgress;
                      })();

                    return (
                      <div key={exam.id} className="surface-card exam-item-card">
                        <div className="exam-top-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="font-mono exam-code-tag">
                              {exam.code}
                            </span>
                            <span className="exam-dept-name">
                              {exam.department}
                            </span>
                          </div>

                          {isResumable ? (
                            <div className="status-pill status-amber">
                              <span className="status-dot status-dot-amber"></span>
                              In Progress • Resume Available
                            </div>
                          ) : isLive ? (
                            <div className="status-pill status-emerald">
                              <span className="status-dot"></span>
                              Ready for Attempt
                            </div>
                          ) : (
                            <div className="status-pill status-neutral">
                              {exam.windowTime}
                            </div>
                          )}
                        </div>

                        <div>
                          <h2 className="exam-title-text">
                            {exam.title}
                          </h2>
                          <div className="exam-type-text">
                            {exam.type} • {exam.windowTime}
                          </div>
                        </div>

                        <div className="exam-specs-grid">
                          <div>
                            <div className="exam-spec-label">Duration</div>
                            <div className="exam-spec-value">{exam.durationMinutes} Minutes</div>
                          </div>
                          <div>
                            <div className="exam-spec-label">Total Questions</div>
                            <div className="exam-spec-value">{exam.totalQuestions} Questions</div>
                          </div>
                          <div>
                            <div className="exam-spec-label">Maximum Marks</div>
                            <div className="exam-spec-value">{exam.totalMarks} Points</div>
                          </div>
                          <div>
                            <div className="exam-spec-label">Scoring Policy</div>
                            <div className="exam-spec-value">{exam.negativeMarking}</div>
                          </div>
                        </div>

                        <div className="exam-footer-row">
                          <div className="exam-security-note">
                            <Lock size={13} color="var(--text-muted)" />
                            <span>Proctored Assessment • Fullscreen Desktop Mode Enforced</span>
                          </div>

                          {isResumable ? (
                            <button
                              id={`btn-resume-exam-${exam.id}`}
                              onClick={() => handleResumeExam(exam.id)}
                              className="btn btn-warning"
                              style={{ padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                            >
                              <RotateCcw size={14} />
                              <span>Resume Exam</span>
                              <ArrowRight size={14} />
                            </button>
                          ) : isLive ? (
                            <button
                              id={`btn-start-exam-${exam.id}`}
                              onClick={() => navigate('/instructions', { state: { exam } })}
                              className="btn btn-primary"
                              style={{ padding: '9px 18px' }}
                            >
                              <span>Review Rules & Enter Exam</span>
                              <ArrowRight size={14} />
                            </button>
                          ) : (
                            <button
                              disabled
                              className="btn btn-secondary btn-sm"
                              style={{ opacity: 0.6 }}
                            >
                              <span>Upcoming Session</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAST RESULTS */}
          {activeTab === 'history' && (
            <div>
              <div className="dashboard-top-row">
                <div>
                  <h1 className="dashboard-page-title">
                    Past Results
                  </h1>
                  <p className="dashboard-page-desc">
                    Completed examinations and recorded evaluation scores.
                  </p>
                </div>
                <button
                  onClick={fetchExamsAndResults}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  title="Refresh results"
                  disabled={loadingResults}
                >
                  <RotateCcw size={13} className={loadingResults ? 'spin' : ''} />
                  <span>{loadingResults ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {pastResults.length === 0 ? (
                <div className="surface-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-default)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <FileText size={22} />
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f5f8', marginBottom: '6px' }}>
                    No Completed Examinations Yet
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px' }}>
                    Your examination submissions and scores will automatically populate here once you complete an assessment.
                  </p>
                  <button
                    onClick={() => setActiveTab('exams')}
                    className="btn btn-secondary btn-sm"
                  >
                    View Available Assessments
                  </button>
                </div>
              ) : (
                <div className="exam-card-list">
                  {pastResults.map((result) => {
                    const formattedDate = result.submittedAt
                      ? new Date(result.submittedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Completed';

                    return (
                      <div key={result.attemptId || result.examId} className="surface-card exam-item-card">
                        <div className="exam-top-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="font-mono exam-code-tag">
                              {result.examCode || result.examId?.toUpperCase()}
                            </span>
                            <span className="exam-dept-name">
                              {result.department || 'Department of Computer Science & Engineering'}
                            </span>
                          </div>

                          <div
                            className="status-pill status-emerald"
                            style={{
                              background: 'rgba(16, 185, 129, 0.12)',
                              borderColor: 'rgba(16, 185, 129, 0.35)',
                              color: '#34d399',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <CheckCircle2 size={12} />
                            <span>Completed</span>
                          </div>
                        </div>

                        <div>
                          <h2 className="exam-title-text">
                            {result.examTitle || result.examId}
                          </h2>
                          <div className="exam-type-text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={12} />
                            <span>Submitted on {formattedDate}</span>
                            <span>•</span>
                            <span>Duration: {result.durationMinutes || 90} Minutes</span>
                          </div>
                        </div>

                        <div
                          className="exam-specs-grid"
                          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}
                        >
                          <div>
                            <div className="exam-spec-label">Score Obtained</div>
                            <div className="exam-spec-value" style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                              <span style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                                {result.score}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>/ {result.totalMarks}</span>
                            </div>
                          </div>

                          <div>
                            <div className="exam-spec-label">Grade Percentage</div>
                            <div
                              className="exam-spec-value"
                              style={{
                                fontSize: '17px',
                                fontWeight: 700,
                                color: '#ffffff',
                              }}
                            >
                              {result.percentage}%
                            </div>
                          </div>

                          <div>
                            <div className="exam-spec-label">Question Breakdown</div>
                            <div className="exam-spec-value" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                              <span style={{ color: '#34d399', fontWeight: 600 }}>{result.correctCount || 0}</span> Correct •{' '}
                              <span style={{ color: '#f87171', fontWeight: 600 }}>{result.wrongCount || 0}</span> Wrong •{' '}
                              <span style={{ color: 'var(--text-muted)' }}>{result.unansweredCount || 0}</span> Skipped
                            </div>
                          </div>

                          <div>
                            <div className="exam-spec-label">Proctoring Status</div>
                            <div className="exam-spec-value" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                              <Shield size={12} color={result.incidentCount === 0 ? '#34d399' : '#fbbf24'} />
                              <span style={{ color: result.incidentCount === 0 ? '#34d399' : '#fbbf24', fontSize: '11.5px' }}>
                                {result.incidentCount === 0 ? 'Clean (0 Flags)' : `${result.incidentCount} Incident Flags`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="exam-footer-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                          <div className="exam-security-note">
                            <CheckCircle2 size={13} color="#34d399" />
                            <span>Attempt Finalized • Single-Attempt Policy Enforced</span>
                          </div>
                          {result.attemptId && (
                            <button
                              onClick={() => navigate(`/results/${result.attemptId}`)}
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <FileCheck size={13} />
                              <span>Review Answers & Results</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="dashboard-bottom-footer">
          <span>Athena Assessment Portal • Candidate Workstation</span>
          <span>Secure Proctoring Protocol Active</span>
        </footer>
      </div>
    </div>
  );
}
