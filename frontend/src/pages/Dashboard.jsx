import React, { useState } from 'react';
import { useAuth } from '../context.jsx';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  FileText,
  LogOut,
  ArrowRight,
  CheckCircle2,
  Lock,
  X,
} from 'lucide-react';
import './pages.css';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('exams'); // 'exams' | 'history'
  const [selectedExam, setSelectedExam] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleStartExam = (exam) => {
    setSelectedExam(null);
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
      rules: [
        'Full-screen lock is enforced for the entire duration of the assessment.',
        'Camera and microphone feed must remain uninterrupted.',
        'Exiting full-screen or switching applications triggers an automatic incident flag.',
        'Calculators and reference sheets are strictly prohibited.',
      ],
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
      rules: [
        'Single monitor setup is strictly required.',
        'Live proctoring with periodic webcam snapshots.',
        'Review and mark questions for review before submitting.',
      ],
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
      rules: [
        'Assessment link unlocks 10 minutes prior to scheduled start time.',
        'Ensure hardware pre-check is completed before test commencement.',
      ],
    },
  ];

  return (
    <div className="dashboard-root">
      {/* Left Application Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          {/* Institutional Brand */}
          <div className="sidebar-brand-box">
            <div className="sidebar-brand-icon">
              <Shield size={18} />
            </div>
            <div className="sidebar-brand-info">
              <span className="sidebar-brand-title">ATHENA</span>
              <span className="sidebar-brand-subtitle">Examination Portal</span>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="sidebar-nav">
            <button
              onClick={() => setActiveTab('exams')}
              className={`sidebar-nav-item ${activeTab === 'exams' ? 'active' : ''}`}
            >
              <div className="sidebar-nav-left">
                <Shield size={16} />
                <span>Assessments</span>
              </div>
              <span className="sidebar-nav-badge">{examinations.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
            >
              <div className="sidebar-nav-left">
                <FileText size={16} />
                <span>Past Results</span>
              </div>
            </button>
          </nav>
        </div>

        {/* User Profile & Actions Footer */}
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
          {/* TAB 1: ASSESSMENTS LIST */}
          {activeTab === 'exams' && (
            <div>
              {/* Header */}
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

              {/* Exam Cards Grid */}
              <div className="exam-card-list">
                {examinations.map((exam) => {
                  const isLive = exam.status === 'AVAILABLE_NOW';

                  return (
                    <div key={exam.id} className="surface-card exam-item-card">
                      {/* Top Row: Code, Department, Status */}
                      <div className="exam-top-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="font-mono exam-code-tag">
                            {exam.code}
                          </span>
                          <span className="exam-dept-name">
                            {exam.department}
                          </span>
                        </div>

                        {isLive ? (
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

                      {/* Middle Row: Title & Specs */}
                      <div>
                        <h2 className="exam-title-text">
                          {exam.title}
                        </h2>
                        <div className="exam-type-text">
                          {exam.type} • {exam.windowTime}
                        </div>
                      </div>

                      {/* Specs Grid */}
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

                      {/* Bottom Row: Actions */}
                      <div className="exam-footer-row">
                        <div className="exam-security-note">
                          <Lock size={13} color="var(--text-muted)" />
                          <span>Proctored Assessment • Fullscreen Desktop Mode Enforced</span>
                        </div>

                        {isLive ? (
                          <button
                            onClick={() => setSelectedExam(exam)}
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
            </div>
          )}

          {/* TAB 2: PAST RESULTS */}
          {activeTab === 'history' && (
            <div className="surface-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{
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
              }}>
                <FileText size={22} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f5f8', marginBottom: '6px' }}>
                No Completed Examinations Yet
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px' }}>
                Your examination submissions, scores, and integrity reports will automatically populate here once you complete an assessment.
              </p>
              <button
                onClick={() => setActiveTab('exams')}
                className="btn btn-secondary btn-sm"
              >
                View Available Assessments
              </button>
            </div>
          )}
        </main>

        {/* Institutional Footer */}
        <footer className="dashboard-bottom-footer">
          <span>Athena Assessment Portal • Candidate Workstation</span>
          <span>Secure Proctoring Protocol Active</span>
        </footer>
      </div>

      {/* Examination Entry Modal */}
      {selectedExam && (
        <div className="modal-overlay">
          <div className="surface-card animate-fade-in modal-content-card">
            {/* Modal Header */}
            <div className="modal-header-row">
              <div>
                <span className="font-mono exam-code-tag">
                  {selectedExam.code}
                </span>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f5f8', marginTop: '6px' }}>
                  {selectedExam.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedExam(null)}
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

            {/* Assessment Rules */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.04em' }}>
                Academic Integrity & Testing Protocol
              </h3>
              <div className="modal-rules-box">
                {selectedExam.rules.map((rule, idx) => (
                  <div key={idx} className="modal-rule-row">
                    <CheckCircle2 size={15} color="#34d399" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-footer-actions">
              <button
                onClick={() => setSelectedExam(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStartExam(selectedExam)}
                className="btn btn-primary"
              >
                <span>Acknowledge & Begin Exam</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
