import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import {
  Shield,
  Camera,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  Lock,
} from 'lucide-react';
import './pages.css';

export default function ExamReadiness() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const exam = location.state?.exam;

  // --- Step 1: Camera State ---
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraChecking, setCameraChecking] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraDeviceLabel, setCameraDeviceLabel] = useState(null);
  const cameraStreamRef = useRef(null);
  const videoRef = useRef(null);

  // --- Step 2: Fullscreen State ---
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullscreenError, setFullscreenError] = useState(null);

  // Stop camera tracks and release device
  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.error('Error stopping camera track:', err);
        }
      });
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraDeviceLabel(null);
  }, []);

  // Monitor fullscreen change events & cleanup on unmount
  useEffect(() => {
    const onFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull) {
        setFullscreenError(null);
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Request camera access only upon user interaction
  const handleEnableCamera = async () => {
    setCameraChecking(true);
    setCameraError(null);

    stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraChecking(false);
      setCameraError('Camera access (getUserMedia) is not supported in this runtime environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track available from camera device.');
      }

      cameraStreamRef.current = stream;
      setCameraDeviceLabel(videoTrack.label || 'Webcam');
      setCameraActive(true);
      setCameraChecking(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.warn('Video preview play handled:', err);
        });
      }

      // Handle track disconnection
      videoTrack.onended = () => {
        setCameraActive(false);
        setCameraDeviceLabel(null);
        cameraStreamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraError('Camera feed disconnected. Please re-enable your camera.');
      };
    } catch (err) {
      console.warn('Camera access error:', err);
      setCameraChecking(false);
      setCameraActive(false);
      cameraStreamRef.current = null;

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your system/browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No webcam was detected. Please connect or verify your camera.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is currently in use by another application (Zoom, FaceTime, etc.).');
      } else {
        setCameraError(err.message || 'Failed to initialize camera.');
      }
    }
  };

  const handleStopCamera = () => {
    stopCameraStream();
    setCameraError(null);
  };

  // Request Fullscreen
  const handleToggleFullscreen = async () => {
    setFullscreenError(null);
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else {
          throw new Error('Fullscreen API is not supported on this platform.');
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen request rejected:', err);
      setFullscreenError(err.message || 'Fullscreen request could not be granted.');
    }
  };

  const handleBackToInstructions = () => {
    stopCameraStream();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate('/instructions', { state: { exam } });
  };

  // Readiness evaluation: both Camera and Fullscreen must be confirmed
  const allReady = cameraActive && isFullscreen;
  const completedCount = (cameraActive ? 1 : 0) + (isFullscreen ? 1 : 0);

  const handleStartExam = () => {
    if (!allReady) return;
    // Navigate directly to the live examination room, preserving exam state
    navigate(`/exam/${exam?.id || 'live'}`, { state: { exam } });
  };

  return (
    <div className="readiness-page">
      {/* Top Navigation Bar */}
      <header className="readiness-navbar">
        <div className="readiness-navbar-inner">
          <div className="readiness-brand-box">
            <button
              onClick={handleBackToInstructions}
              className="readiness-btn-back"
              title="Return to Instructions"
              aria-label="Return to Instructions"
            >
              <ArrowLeft size={16} />
              <span>Back to Instructions</span>
            </button>
            <div className="readiness-divider-vertical" />
            <div className="readiness-brand-title">
              <div className="readiness-brand-icon">
                <Shield size={16} color="#2563eb" />
              </div>
              <div>
                <span className="brand-name">ATHENA</span>
                <span className="brand-badge">EXAM READINESS</span>
              </div>
            </div>
          </div>

          {/* Stepper Breadcrumb */}
          <div className="readiness-stepper">
            <div className="readiness-step completed">
              <span className="step-circle"><Check size={12} /></span>
              <span className="step-text">Instructions</span>
            </div>
            <div className="stepper-line" />
            <div className="readiness-step active">
              <span className="step-circle">2</span>
              <span className="step-text">Readiness</span>
            </div>
            <div className="stepper-line" />
            <div className="readiness-step upcoming">
              <span className="step-circle">3</span>
              <span className="step-text">Live Exam</span>
            </div>
          </div>

          {/* Candidate Profile Info */}
          <div className="readiness-user-info">
            <div className="readiness-avatar">
              {user?.name ? user.name[0].toUpperCase() : 'C'}
            </div>
            <div className="readiness-user-text">
              <span className="user-name">{user?.name || 'Candidate'}</span>
              <span className="user-email">{user?.email || 'Authenticated'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="readiness-main-container">
        {/* Exam Title Banner */}
        <section className="readiness-card readiness-exam-banner">
          <div className="readiness-exam-meta">
            <span className="readiness-code-pill font-mono">{exam?.code || 'CS-401'}</span>
            <span className="readiness-exam-dept">{exam?.subject || exam?.department || 'Assessment Session'}</span>
            <span className="readiness-lock-pill">
              <Lock size={12} />
              <span>Proctored Session</span>
            </span>
          </div>
          <h1 className="readiness-exam-title">
            {exam?.title || 'Advanced Computer Networks & Distributed Systems'}
          </h1>
          <p className="readiness-exam-subtitle">
            Complete the 2 required pre-flight checks below to unlock the examination room.
          </p>
        </section>

        {/* Overall Status Banner */}
        <div className={`readiness-summary-alert ${allReady ? 'alert-success' : 'alert-pending'}`}>
          <div className="summary-alert-content">
            {allReady ? (
              <CheckCircle2 size={20} className="alert-icon-ready" />
            ) : (
              <AlertCircle size={20} className="alert-icon-pending" />
            )}
            <div>
              <div className="summary-alert-title">
                {allReady
                  ? 'All Readiness Requirements Met — Ready to Begin'
                  : `Readiness Incomplete (${completedCount} of 2 checks completed)`}
              </div>
              <div className="summary-alert-desc">
                {allReady
                  ? 'Your webcam is active and full-screen lockdown is engaged. Click "Start Examination" to commence.'
                  : 'Enable your camera and enter full-screen mode to unlock the Start Exam button.'}
              </div>
            </div>
          </div>
          <div className="readiness-progress-pill font-mono">
            {completedCount} / 2 Ready
          </div>
        </div>

        {/* The Required Checks */}
        <div className="readiness-steps-stack">
          {/* =========================================================================
              CHECK 1: ENABLE YOUR CAMERA
             ========================================================================= */}
          <div className={`readiness-card step-card ${cameraActive ? 'step-completed' : ''}`}>
            <div className="step-card-header">
              <div className="step-title-group">
                <div className={`step-icon-box ${cameraActive ? 'icon-success' : 'icon-primary'}`}>
                  <Camera size={20} />
                </div>
                <div>
                  <div className="step-number-tag">Requirement 1</div>
                  <h2 className="step-headline">Enable your camera</h2>
                </div>
              </div>

              {/* Status Indicator */}
              {cameraActive ? (
                <span className="readiness-status-badge status-ready">
                  <CheckCircle2 size={14} />
                  <span>Camera Active</span>
                </span>
              ) : (
                <span className="readiness-status-badge status-pending">
                  <AlertCircle size={14} />
                  <span>Action Required</span>
                </span>
              )}
            </div>

            <p className="step-description">
              Grant webcam permission so the automated proctor can verify single-candidate presence throughout the assessment. Position yourself in a well-lit environment facing the display directly.
            </p>

            {/* Live Camera Preview Box */}
            {cameraActive && (
              <div className="readiness-camera-preview-box">
                <div className="preview-video-container">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="readiness-preview-video"
                    aria-label="Webcam live preview feed"
                  />
                  <div className="preview-live-indicator">
                    <span className="pulse-dot" />
                    <span>Live Camera</span>
                  </div>
                </div>
                <div className="preview-meta-details">
                  <span className="preview-meta-title">Verified Camera Device</span>
                  <span className="preview-meta-label">{cameraDeviceLabel}</span>
                  <span className="preview-meta-note">Camera stream running locally.</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {cameraError && (
              <div className="readiness-error-alert" role="alert">
                <AlertTriangle size={16} className="error-icon" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="step-card-actions">
              {cameraActive ? (
                <button
                  onClick={handleStopCamera}
                  className="readiness-btn-secondary"
                  id="btn-stop-camera"
                >
                  <RotateCcw size={14} />
                  <span>Disable Camera</span>
                </button>
              ) : (
                <button
                  onClick={handleEnableCamera}
                  disabled={cameraChecking}
                  className="readiness-btn-primary"
                  id="btn-enable-camera"
                >
                  <Camera size={16} />
                  <span>{cameraChecking ? 'Connecting Camera...' : 'Enable Camera'}</span>
                </button>
              )}
            </div>
          </div>

          {/* =========================================================================
              CHECK 2: ENTER FULLSCREEN
             ========================================================================= */}
          <div className={`readiness-card step-card ${isFullscreen ? 'step-completed' : ''}`}>
            <div className="step-card-header">
              <div className="step-title-group">
                <div className={`step-icon-box ${isFullscreen ? 'icon-success' : 'icon-primary'}`}>
                  <Maximize2 size={20} />
                </div>
                <div>
                  <div className="step-number-tag">Requirement 2</div>
                  <h2 className="step-headline">Enter fullscreen</h2>
                </div>
              </div>

              {/* Status Indicator */}
              {isFullscreen ? (
                <span className="readiness-status-badge status-ready">
                  <CheckCircle2 size={14} />
                  <span>Fullscreen Active</span>
                </span>
              ) : (
                <span className="readiness-status-badge status-pending">
                  <AlertCircle size={14} />
                  <span>Action Required</span>
                </span>
              )}
            </div>

            <p className="step-description">
              Full-screen desktop lock is strictly enforced. It minimizes external desktop distractions and alerts the proctoring service if window switching occurs.
            </p>

            {/* Error Message */}
            {fullscreenError && (
              <div className="readiness-error-alert" role="alert">
                <AlertTriangle size={16} className="error-icon" />
                <span>{fullscreenError}</span>
              </div>
            )}

            {isFullscreen && (
              <div className="readiness-device-banner">
                <Check size={14} className="device-check-icon" />
                <span>Full-screen lockdown engaged. Exiting full-screen will revoke exam readiness.</span>
              </div>
            )}

            <div className="step-card-actions">
              <button
                onClick={handleToggleFullscreen}
                className={isFullscreen ? 'readiness-btn-secondary' : 'readiness-btn-primary'}
                id="btn-fullscreen"
              >
                <Maximize2 size={16} />
                <span>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Action Footer */}
        <footer className="readiness-card readiness-action-footer">
          <button
            onClick={handleBackToInstructions}
            className="readiness-btn-secondary"
            aria-label="Return to Instructions"
          >
            <ArrowLeft size={16} />
            <span>Back to Instructions</span>
          </button>

          <div className="action-footer-right">
            <span className="action-footer-hint">
              {allReady
                ? 'Camera & Fullscreen verified. Ready to enter exam.'
                : 'Both camera and fullscreen must be active to proceed.'}
            </span>

            <button
              onClick={handleStartExam}
              disabled={!allReady}
              className="readiness-btn-start"
              id="btn-start-exam"
              title={
                allReady
                  ? 'Launch Live Examination Room'
                  : 'Enable camera and enter fullscreen to unlock'
              }
              aria-disabled={!allReady}
            >
              <span>Start Examination</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
