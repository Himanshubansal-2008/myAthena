const express = require("express");
const prisma = require("../prisma");
const { authenticateToken, enforceCandidateIdentity } = require("../middleware/authMiddleware");
const { evaluateAnswer, calculateGrading } = require("../utils/grading");

const router = express.Router();

// Enforce token verification and candidate identity on all exam endpoints
router.use(authenticateToken);
router.use(enforceCandidateIdentity);

/**
 * Authoritatively grades an attempt, persists its Result record,
 * and sets status to AUTO_SUBMITTED with submittedAt timestamp.
 * Idempotent: returns existing result if already calculated.
 */
async function autoSubmitAttempt(attemptId, externalTx = null) {
  const runner = async (tx) => {
    // Acquire row-level lock on Attempt in PostgreSQL to prevent concurrent submission races
    await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id = ${attemptId} FOR UPDATE`;

    const fullAttempt = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { questions: { orderBy: { order: "asc" } } } },
        answers: true,
        result: true,
      },
    });

    if (!fullAttempt) return null;

    if (
      (fullAttempt.status === "SUBMITTED" || fullAttempt.status === "AUTO_SUBMITTED") &&
      fullAttempt.result
    ) {
      return fullAttempt.result;
    }

    const answersMap = {};
    if (fullAttempt.answers) {
      fullAttempt.answers.forEach((a) => {
        answersMap[a.questionId] = a.selectedOption;
      });
    }

    const questions = fullAttempt?.exam?.questions || [];
    const grading = calculateGrading(questions, answersMap, fullAttempt?.exam || {});

    const result = await tx.result.upsert({
      where: { attemptId },
      update: {
        score: grading.score,
        totalMarks: grading.totalMarks,
        correctCount: grading.correctCount,
        wrongCount: grading.wrongCount,
        unansweredCount: grading.unansweredCount,
        calculatedAt: new Date(),
      },
      create: {
        attemptId,
        score: grading.score,
        totalMarks: grading.totalMarks,
        correctCount: grading.correctCount,
        wrongCount: grading.wrongCount,
        unansweredCount: grading.unansweredCount,
      },
    });

    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: "AUTO_SUBMITTED",
        submittedAt: fullAttempt.submittedAt || new Date(),
      },
    });

    return result;
  };

  if (externalTx) {
    return await runner(externalTx);
  }
  return await prisma.$transaction(runner);
}

/**
 * GET /api/exams/results/my-results
 * Retrieve all completed examination results for authenticated candidate
 */
router.get("/results/my-results", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const attempts = await prisma.attempt.findMany({
      where: {
        userId,
        status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
      },
      orderBy: { submittedAt: "desc" },
      include: {
        exam: true,
        result: true,
        incidents: {
          select: {
            id: true,
            type: true,
            occurredAt: true,
          },
          orderBy: { occurredAt: "asc" },
        },
        _count: {
          select: { incidents: true },
        },
      },
    });

    // Ensure any submitted attempts missing a result record are authoritatively calculated
    for (const att of attempts) {
      if (!att.result) {
        try {
          att.result = await autoSubmitAttempt(att.id);
        } catch (e) {
          console.error(`Auto-calculate missing result for attempt ${att.id} error:`, e);
        }
      }
    }

    const results = attempts.map((att) => {
      const resData = att.result || {
        score: 0,
        totalMarks: att.exam?.totalMarks || 100,
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
      };

      const percentage = Number(((resData.score / resData.totalMarks) * 100).toFixed(1));

      const incidentCountsByType = {};
      if (Array.isArray(att.incidents)) {
        att.incidents.forEach((inc) => {
          incidentCountsByType[inc.type] = (incidentCountsByType[inc.type] || 0) + 1;
        });
      }

      const totalIncidents = att._count?.incidents ?? (att.incidents?.length || 0);

      return {
        attemptId: att.id,
        examId: att.exam.id,
        examTitle: att.exam.title,
        examCode: att.exam.id.toUpperCase(),
        department: att.exam.description || "School of Engineering",
        durationMinutes: att.exam.durationMinutes,
        score: resData.score,
        totalMarks: resData.totalMarks,
        percentage,
        correctCount: resData.correctCount,
        wrongCount: resData.wrongCount,
        unansweredCount: resData.unansweredCount,
        status: "COMPLETED",
        submittedAt: att.submittedAt || att.updatedAt,
        incidentCount: totalIncidents,
        incidentCountsByType,
        proctoringSummary: {
          total: totalIncidents,
          byType: incidentCountsByType,
          hasIncidents: totalIncidents > 0,
        },
      };
    });

    res.json({ results });
  } catch (error) {
    console.error("Retrieve past results error:", error);
    res.status(500).json({ message: "Unable to retrieve past results." });
  }
});

/**
 * GET /api/exams/results/:attemptId
 * Detailed question-by-question performance evaluation
 */
router.get("/results/:attemptId", authenticateToken, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.userId;

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
        answers: true,
        incidents: {
          orderBy: { occurredAt: "asc" },
        },
        result: true,
      },
    });

    if (!attempt || attempt.userId !== userId) {
      return res.status(404).json({ message: "Result not found or unauthorized access." });
    }

    if (!attempt.result) {
      if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
        attempt.result = await autoSubmitAttempt(attempt.id);
      } else {
        return res.status(400).json({ message: "Examination results are still pending calculation." });
      }
    }

    const answersMap = {};
    attempt.answers.forEach((ans) => {
      answersMap[ans.questionId] = ans.selectedOption;
    });

    const negativeMarking =
      typeof attempt.exam.negativeMarking === "number" && attempt.exam.negativeMarking > 0
        ? attempt.exam.negativeMarking
        : 0;

    const questionReviews = attempt.exam.questions.map((q) => {
      const selectedOption = answersMap[q.id];
      const { isAnswered, isCorrect } = evaluateAnswer(selectedOption, q);

      // Resolve correct option index and text from options array
      let correctOptionIndex = null;
      let correctOptionText = String(q.correctAnswer ?? "");
      if (Array.isArray(q.options)) {
        const numIdx = Number(q.correctAnswer);
        if (!isNaN(numIdx) && numIdx >= 0 && numIdx < q.options.length) {
          correctOptionIndex = numIdx;
          correctOptionText = String(q.options[numIdx] ?? "");
        } else {
          const foundIdx = q.options.findIndex(
            (opt) => String(opt).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()
          );
          if (foundIdx !== -1) {
            correctOptionIndex = foundIdx;
            correctOptionText = String(q.options[foundIdx] ?? "");
          }
        }
      }

      // Resolve selected option index and text from options array
      let selectedOptionIndex = null;
      let selectedOptionText = null;
      if (isAnswered) {
        selectedOptionText = String(selectedOption);
        if (Array.isArray(q.options)) {
          const numIdx = Number(selectedOption);
          if (!isNaN(numIdx) && numIdx >= 0 && numIdx < q.options.length) {
            selectedOptionIndex = numIdx;
            selectedOptionText = String(q.options[numIdx] ?? "");
          } else {
            const foundIdx = q.options.findIndex(
              (opt) => String(opt).trim().toLowerCase() === String(selectedOption).trim().toLowerCase()
            );
            if (foundIdx !== -1) {
              selectedOptionIndex = foundIdx;
              selectedOptionText = String(q.options[foundIdx] ?? "");
            }
          }
        }
      }

      // Authoritative marks awarded for this question
      const qMarks = typeof q.marks === "number" && q.marks > 0 ? q.marks : 1;
      let marksAwarded = 0;
      if (isCorrect) {
        marksAwarded = qMarks;
      } else if (isAnswered) {
        marksAwarded = -negativeMarking;
      }

      return {
        id: q.id,
        order: q.order,
        text: q.text,
        options: q.options,
        selectedOption: isAnswered ? selectedOption : null,
        selectedOptionIndex,
        selectedOptionText,
        correctAnswer: q.correctAnswer,
        correctOptionIndex,
        correctOptionText,
        isAnswered,
        isCorrect,
        marks: qMarks,
        marksAwarded,
        explanation: q.explanation || null,
      };
    });

    const percentage = Number(((attempt.result.score / attempt.result.totalMarks) * 100).toFixed(1));
    const passed = percentage >= 40.0;

    const incidentCountsByType = {};
    if (Array.isArray(attempt.incidents)) {
      attempt.incidents.forEach((inc) => {
        incidentCountsByType[inc.type] = (incidentCountsByType[inc.type] || 0) + 1;
      });
    }

    const totalIncidents = attempt.incidents?.length || 0;

    res.json({
      attemptId: attempt.id,
      examId: attempt.exam.id,
      examTitle: attempt.exam.title,
      examCode: attempt.exam.id.toUpperCase(),
      department: attempt.exam.description || "School of Engineering",
      durationMinutes: attempt.exam.durationMinutes,
      negativeMarking,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt || attempt.updatedAt,
      score: attempt.result.score,
      totalMarks: attempt.result.totalMarks,
      percentage,
      passed,
      status: "COMPLETED",
      correctCount: attempt.result.correctCount,
      wrongCount: attempt.result.wrongCount,
      unansweredCount: attempt.result.unansweredCount,
      totalQuestions: attempt.exam.questions.length,
      incidentCount: totalIncidents,
      incidentCountsByType,
      proctoringSummary: {
        total: totalIncidents,
        byType: incidentCountsByType,
        hasIncidents: totalIncidents > 0,
      },
      incidents: attempt.incidents,
      questions: questionReviews,
    });
  } catch (error) {
    console.error("Retrieve detailed result error:", error);
    res.status(500).json({ message: "Unable to retrieve detailed result." });
  }
});

/**
 * GET /api/exams
 * List available published exams annotated with candidate attempt status
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const exams = await prisma.exam.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        description: true,
        durationMinutes: true,
        totalMarks: true,
        negativeMarking: true,
        status: true,
        instructions: true,
        startTime: true,
        endTime: true,
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let attemptsByUser = {};
    if (req.user?.userId) {
      const attempts = await prisma.attempt.findMany({
        where: { userId: req.user.userId },
        include: { result: true },
      });
      // Synchronize any timed out in-progress attempts
      for (const att of attempts) {
        if (att.status === "IN_PROGRESS" && att.deadlineAt && new Date() > new Date(att.deadlineAt)) {
          try {
            const gradedResult = await autoSubmitAttempt(att.id);
            att.status = "AUTO_SUBMITTED";
            att.submittedAt = new Date();
            att.result = gradedResult;
          } catch (e) {
            console.error("Auto submit on list exams error:", e);
          }
        }
      }

      attemptsByUser = attempts.reduce((acc, att) => {
        acc[att.examId] = att;
        return acc;
      }, {});
    }

    const now = new Date();
    const payload = exams.map((exam) => {
      const userAttempt = attemptsByUser[exam.id];
      const isSubmitted = userAttempt?.status === "SUBMITTED" || userAttempt?.status === "AUTO_SUBMITTED";
      const isInProgress = userAttempt?.status === "IN_PROGRESS";

      const hasStartTime = Boolean(exam.startTime);
      const isFuture = hasStartTime && new Date(exam.startTime) > now;
      const startsInSeconds = isFuture
        ? Math.max(0, Math.floor((new Date(exam.startTime).getTime() - now.getTime()) / 1000))
        : 0;
      const isAvailable = (!hasStartTime || new Date(exam.startTime) <= now) &&
                          (!exam.endTime || new Date(exam.endTime) >= now);

      return {
        ...exam,
        isFuture,
        startsInSeconds,
        isAvailable,
        serverTime: now.toISOString(),
        attempt: userAttempt
          ? {
              id: userAttempt.id,
              status: userAttempt.status,
              startedAt: userAttempt.startedAt,
              deadlineAt: userAttempt.deadlineAt,
              submittedAt: userAttempt.submittedAt,
              isSubmitted,
              isInProgress,
              result: userAttempt.result,
            }
          : null,
        canAttempt: !isSubmitted && !isFuture && isAvailable,
      };
    });

    res.json({ exams: payload, serverTime: now.toISOString() });
  } catch (error) {
    console.error("List exams error:", error);
    res.status(500).json({ message: "Unable to retrieve examinations." });
  }
});

/**
 * GET /api/exams/session/active
 * Detect any unfinished, in-progress examination session for authenticated candidate
 */
router.get("/session/active", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const attempts = await prisma.attempt.findMany({
      where: {
        userId,
        status: "IN_PROGRESS",
      },
      orderBy: { startedAt: "desc" },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            description: true,
            durationMinutes: true,
            totalMarks: true,
            negativeMarking: true,
            status: true,
            _count: {
              select: { questions: true },
            },
          },
        },
        answers: {
          orderBy: { savedAt: "desc" },
          take: 1,
        },
        _count: {
          select: { answers: true },
        },
      },
    });

    const activeAttempt = attempts[0];
    if (!activeAttempt) {
      return res.json({ hasActiveSession: false, session: null });
    }

    const serverNow = new Date();
    // Verify session expiry
    if (activeAttempt.deadlineAt && serverNow > new Date(activeAttempt.deadlineAt)) {
      const graded = await autoSubmitAttempt(activeAttempt.id);
      return res.json({
        hasActiveSession: false,
        session: null,
        expiredSession: {
          attemptId: activeAttempt.id,
          examId: activeAttempt.examId,
          status: "AUTO_SUBMITTED",
          result: graded,
        },
      });
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(activeAttempt.deadlineAt).getTime() - serverNow.getTime()) / 1000)
    );

    const lastQuestionId = activeAttempt.answers?.[0]?.questionId || null;

    res.json({
      hasActiveSession: true,
      session: {
        attemptId: activeAttempt.id,
        examId: activeAttempt.exam.id,
        examTitle: activeAttempt.exam.title,
        examCode: activeAttempt.exam.id.toUpperCase(),
        department: activeAttempt.exam.description,
        startedAt: activeAttempt.startedAt,
        deadlineAt: activeAttempt.deadlineAt,
        remainingSeconds,
        serverTime: serverNow.toISOString(),
        durationMinutes: activeAttempt.exam.durationMinutes,
        totalQuestions: activeAttempt.exam._count?.questions || 0,
        answeredCount: activeAttempt._count?.answers || 0,
        lastQuestionId,
        exam: activeAttempt.exam,
      },
    });
  } catch (error) {
    console.error("Detect active session error:", error);
    res.status(500).json({ message: "Unable to retrieve active session." });
  }
});

/**
 * GET /api/exams/session/:attemptId
 * Validate and retrieve specific session state with strict candidate ownership verification
 */
router.get("/session/:attemptId", authenticateToken, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.userId;

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
        answers: true,
      },
    });

    if (!attempt) {
      return res.status(404).json({
        message: "Examination session not found.",
        code: "ATTEMPT_NOT_FOUND",
      });
    }

    // Security check: Candidate can only access their own session
    if (attempt.userId !== userId) {
      return res.status(403).json({
        message: "Unauthorized: You do not own this examination session.",
        code: "FORBIDDEN",
      });
    }

    const serverNow = new Date();
    const isExpired = Boolean(attempt.deadlineAt) && serverNow > new Date(attempt.deadlineAt);

    if (isExpired && attempt.status === "IN_PROGRESS") {
      const graded = await autoSubmitAttempt(attempt.id);
      return res.status(403).json({
        message: "Assessment deadline has expired.",
        code: "ALREADY_SUBMITTED",
        isTimeout: true,
        attemptId: attempt.id,
        result: graded,
      });
    }

    if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
      return res.status(403).json({
        message: "This examination has already been submitted.",
        code: "ALREADY_SUBMITTED",
        attemptId: attempt.id,
      });
    }

    const remainingSeconds = attempt.deadlineAt
      ? Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - serverNow.getTime()) / 1000))
      : 0;

    res.json({
      attemptId: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      remainingSeconds,
      serverTime: serverNow.toISOString(),
      answeredCount: attempt.answers.length,
    });
  } catch (error) {
    console.error("Retrieve attempt session error:", error);
    res.status(500).json({ message: "Unable to retrieve session." });
  }
});

/**
 * GET /api/exams/:id
 * Retrieve live exam details, questions (sanitized without answer keys),
 * and candidate active attempt session.
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.user.userId;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      return res.status(404).json({
        message: "Examination not found.",
        code: "EXAM_NOT_FOUND",
      });
    }

    // Verify candidate authorization to access exam
    if (exam.status !== "PUBLISHED") {
      return res.status(403).json({
        message: "This examination is not published or currently accessible.",
        code: "EXAM_NOT_AVAILABLE",
      });
    }

    // Verify scheduled start time
    if (exam.startTime && new Date(exam.startTime) > new Date()) {
      const now = new Date();
      const startsInSeconds = Math.max(0, Math.floor((new Date(exam.startTime).getTime() - now.getTime()) / 1000));
      if (req.query.checkOnly === "true") {
        return res.json({
          canAttempt: false,
          isFuture: true,
          startTime: exam.startTime,
          startsInSeconds,
          serverTime: now.toISOString(),
          message: "This examination is scheduled for the future and has not unlocked yet.",
        });
      }
      return res.status(403).json({
        message: "This examination is scheduled for the future and has not started yet.",
        code: "EXAM_NOT_STARTED_YET",
        startTime: exam.startTime,
        startsInSeconds,
        serverTime: now.toISOString(),
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          durationMinutes: exam.durationMinutes,
          totalMarks: exam.totalMarks,
        },
      });
    }

    // Security check: Verify candidate ownership if attemptId query parameter is provided
    if (req.query.attemptId) {
      const specifiedAttempt = await prisma.attempt.findUnique({
        where: { id: req.query.attemptId },
      });
      if (!specifiedAttempt) {
        return res.status(404).json({
          message: "Examination attempt not found.",
          code: "ATTEMPT_NOT_FOUND",
        });
      }
      if (specifiedAttempt.userId !== userId) {
        return res.status(403).json({
          message: "Unauthorized: You do not own this examination session.",
          code: "FORBIDDEN",
        });
      }
      if (specifiedAttempt.examId !== exam.id) {
        return res.status(400).json({
          message: "Examination attempt does not belong to the specified exam.",
          code: "INVALID_EXAM_SESSION",
        });
      }
    }

    // Single-attempt restriction check
    const existingAttempts = await prisma.attempt.findMany({
      where: {
        userId,
        examId: exam.id,
      },
      include: {
        answers: true,
        result: true,
      },
      orderBy: { startedAt: "desc" },
    });

    const submittedAttempt = existingAttempts.find(
      (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"
    );

    if (submittedAttempt) {
      return res.status(403).json({
        message: "You have already completed and submitted this examination.",
        code: "ALREADY_SUBMITTED",
        isTimeout: submittedAttempt.status === "AUTO_SUBMITTED",
        attemptId: submittedAttempt.id,
        submittedAt: submittedAttempt.submittedAt,
        result: submittedAttempt.result,
      });
    }

    // Reuse existing active attempt if available, otherwise create a new one
    let activeAttempt = existingAttempts.find((a) => a.status === "IN_PROGRESS");

    // Check if active attempt has expired (timed out)
    if (activeAttempt && activeAttempt.deadlineAt && new Date() > new Date(activeAttempt.deadlineAt)) {
      // Auto-submit the expired attempt immediately
      const gradedResult = await autoSubmitAttempt(activeAttempt.id);
      const updated = await prisma.attempt.findUnique({
        where: { id: activeAttempt.id },
      });

      return res.status(403).json({
        message: "Your examination deadline has elapsed and the session was automatically submitted.",
        code: "ALREADY_SUBMITTED",
        isTimeout: true,
        attemptId: activeAttempt.id,
        submittedAt: updated?.submittedAt || new Date(),
        result: gradedResult,
      });
    }

    if (req.query.checkOnly === "true") {
      return res.json({
        canAttempt: true,
        hasActiveAttempt: Boolean(activeAttempt),
        attempt: activeAttempt
          ? {
              id: activeAttempt.id,
              status: activeAttempt.status,
              startedAt: activeAttempt.startedAt,
              deadlineAt: activeAttempt.deadlineAt,
            }
          : null,
      });
    }

    if (!activeAttempt) {
      const now = new Date();
      const durationMs = (exam.durationMinutes || 60) * 60 * 1000;
      activeAttempt = await prisma.attempt.create({
        data: {
          userId,
          examId: exam.id,
          status: "IN_PROGRESS",
          startedAt: now,
          deadlineAt: new Date(now.getTime() + durationMs),
        },
        include: {
          answers: true,
        },
      });
    }

    // Fetch real questions sanitized WITHOUT correct answers
    const questions = await prisma.question.findMany({
      where: { examId: exam.id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        examId: true,
        text: true,
        options: true,
        marks: true,
        order: true,
      },
    });

    // Populate previously saved answers and review flags if any
    const answersMap = {};
    const flagsMap = {};
    if (activeAttempt.answers && Array.isArray(activeAttempt.answers)) {
      for (const ans of activeAttempt.answers) {
        if (ans.questionId && ans.selectedOption !== null && ans.selectedOption !== undefined && ans.selectedOption !== "") {
          const optNum = Number(ans.selectedOption);
          answersMap[ans.questionId] = isNaN(optNum) ? ans.selectedOption : optNum;
        }
        if (ans.questionId && ans.isMarkedForReview) {
          flagsMap[ans.questionId] = true;
        }
      }
    }

    const examPayload = {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      negativeMarking: exam.negativeMarking,
      status: exam.status,
      instructions: exam.instructions,
      questions,
    };

    const serverNow = new Date();
    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(activeAttempt.deadlineAt).getTime() - serverNow.getTime()) / 1000)
    );

    const sortedAnswers = (activeAttempt.answers || []).slice().sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
    const lastQuestionId = sortedAnswers.length > 0 ? sortedAnswers[0].questionId : null;

    res.json({
      serverTime: serverNow.toISOString(),
      exam: examPayload,
      questions,
      lastQuestionId,
      attempt: {
        id: activeAttempt.id,
        status: activeAttempt.status,
        startedAt: activeAttempt.startedAt,
        deadlineAt: activeAttempt.deadlineAt,
        serverTime: serverNow.toISOString(),
        remainingSeconds,
        durationMinutes: exam.durationMinutes,
        totalSeconds: (exam.durationMinutes || 60) * 60,
      },
      answers: answersMap,
      flags: flagsMap,
    });
  } catch (error) {
    console.error("Fetch exam session error:", error);
    res.status(500).json({
      message: "An unexpected error occurred while loading the examination.",
      code: "SERVER_ERROR",
    });
  }
});

/**
 * GET /api/exams/:id/timer
 * Retrieve authoritative server timer state and remaining countdown
 */
router.get("/:id/timer", authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.user.userId;

    let targetAttempt = null;
    if (req.query.attemptId) {
      const specifiedAttempt = await prisma.attempt.findUnique({
        where: { id: req.query.attemptId },
        include: { result: true },
      });
      if (!specifiedAttempt) {
        return res.status(404).json({
          message: "Examination attempt not found.",
          code: "ATTEMPT_NOT_FOUND",
        });
      }
      if (specifiedAttempt.userId !== userId) {
        return res.status(403).json({
          message: "Unauthorized: You do not own this examination session.",
          code: "FORBIDDEN",
        });
      }
      if (specifiedAttempt.examId !== examId) {
        return res.status(400).json({
          message: "Examination attempt does not belong to the specified exam.",
          code: "INVALID_EXAM_SESSION",
        });
      }
      targetAttempt = specifiedAttempt;
    }

    if (!targetAttempt) {
      const attempts = await prisma.attempt.findMany({
        where: { userId, examId },
        orderBy: { startedAt: "desc" },
        include: { result: true },
      });

      const submitted = attempts.find(
        (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"
      );

      if (submitted) {
        targetAttempt = submitted;
      } else {
        targetAttempt = attempts.find((a) => a.status === "IN_PROGRESS");
      }
    }

    if (targetAttempt && (targetAttempt.status === "SUBMITTED" || targetAttempt.status === "AUTO_SUBMITTED")) {
      return res.json({
        serverTime: new Date().toISOString(),
        attemptId: targetAttempt.id,
        status: targetAttempt.status,
        isExpired: true,
        remainingSeconds: 0,
        result: targetAttempt.result,
      });
    }

    const activeAttempt = targetAttempt;
    if (!activeAttempt) {
      return res.status(404).json({
        message: "No active examination session found.",
        code: "ATTEMPT_NOT_FOUND",
      });
    }

    const serverNow = new Date();
    const isTimedOut = Boolean(activeAttempt.deadlineAt) && serverNow > new Date(activeAttempt.deadlineAt);

    if (isTimedOut) {
      const gradedResult = await autoSubmitAttempt(activeAttempt.id);
      return res.json({
        serverTime: serverNow.toISOString(),
        attemptId: activeAttempt.id,
        status: "AUTO_SUBMITTED",
        isExpired: true,
        remainingSeconds: 0,
        result: gradedResult,
      });
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(activeAttempt.deadlineAt).getTime() - serverNow.getTime()) / 1000)
    );

    res.json({
      serverTime: serverNow.toISOString(),
      attemptId: activeAttempt.id,
      startedAt: activeAttempt.startedAt,
      deadlineAt: activeAttempt.deadlineAt,
      remainingSeconds,
      status: activeAttempt.status,
      isExpired: false,
    });
  } catch (error) {
    console.error("Timer sync error:", error);
    res.status(500).json({ message: "Failed to synchronize assessment timer." });
  }
});

// Map to track latest client timestamps and sequences per attemptId:questionId
// to prevent stale requests from overwriting newer answers due to network races
const latestAnswerUpdates = new Map();

function trackAnswerUpdate(key, timestamp, sequence) {
  if (latestAnswerUpdates.size > 5000) {
    const keysToDelete = Array.from(latestAnswerUpdates.keys()).slice(0, 1000);
    keysToDelete.forEach((k) => latestAnswerUpdates.delete(k));
  }
  latestAnswerUpdates.set(key, { timestamp, sequence, updatedAt: Date.now() });
}

/**
 * POST /api/exams/:id/answer
 * Auto-save candidate selected option or review flag for an in-progress attempt
 */
router.post("/:id/answer", authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.user.userId;
    const { questionId, selectedOption, isMarkedForReview, attemptId, clientTimestamp, sequence } = req.body;

    if (!questionId) {
      return res.status(400).json({
        message: "Question ID is required.",
        code: "INVALID_QUESTION_ID",
      });
    }

    // Retrieve attempts for authenticated user and exam
    let targetAttempt;
    if (attemptId) {
      const specifiedAttempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
      });
      if (!specifiedAttempt) {
        return res.status(404).json({
          message: "Examination attempt not found.",
          code: "ATTEMPT_NOT_FOUND",
        });
      }
      if (specifiedAttempt.userId !== userId) {
        return res.status(403).json({
          message: "Unauthorized: You do not own this examination session.",
          code: "FORBIDDEN",
        });
      }
      if (specifiedAttempt.examId !== examId) {
        return res.status(400).json({
          message: "Examination attempt does not belong to the specified exam.",
          code: "INVALID_EXAM_SESSION",
        });
      }
      targetAttempt = specifiedAttempt;
    } else {
      const existingAttempts = await prisma.attempt.findMany({
        where: {
          userId,
          examId,
        },
        orderBy: { startedAt: "desc" },
      });
      targetAttempt = existingAttempts[0];
    }

    if (!targetAttempt) {
      return res.status(404).json({
        message: "Examination attempt not found.",
        code: "ATTEMPT_NOT_FOUND",
      });
    }

    // Atomic session verification and answer update in transaction to prevent concurrency races with submission
    const saveResult = await prisma.$transaction(async (tx) => {
      const freshAttempt = await tx.attempt.findUnique({
        where: { id: targetAttempt.id },
      });

      if (!freshAttempt || freshAttempt.userId !== userId) {
        throw {
          status: 403,
          code: "FORBIDDEN",
          message: "Unauthorized: You do not own this examination session.",
        };
      }

      // Reject modifications to submitted sessions
      if (freshAttempt.status === "SUBMITTED" || freshAttempt.status === "AUTO_SUBMITTED") {
        throw {
          status: 403,
          code: "ALREADY_SUBMITTED",
          message: "Modifications to submitted examination sessions are rejected.",
        };
      }

      if (freshAttempt.status !== "IN_PROGRESS") {
        throw {
          status: 403,
          code: "INVALID_SESSION_STATUS",
          message: "Examination session is not active.",
        };
      }

      // Check timeout
      if (freshAttempt.deadlineAt && new Date() > new Date(freshAttempt.deadlineAt)) {
        try {
          await autoSubmitAttempt(freshAttempt.id, tx);
        } catch (e) {
          console.error("Auto submit on answer expiry error:", e);
        }

        return { expired: true, freshAttempt };
      }

      // Verify question belongs to this exam
      const question = await tx.question.findFirst({
        where: {
          id: questionId,
          examId: freshAttempt.examId,
        },
      });

      if (!question) {
        throw {
          status: 404,
          code: "INVALID_QUESTION_ID",
          message: "Question not found or does not belong to this examination.",
        };
      }

      // Prevent rapid answer changes from overwriting newer answers due to network races
      const updateKey = `${freshAttempt.id}:${questionId}`;
      const reqTimestamp = clientTimestamp ? Number(clientTimestamp) : null;
      const reqSequence = sequence !== undefined && sequence !== null ? Number(sequence) : null;

      if (reqTimestamp) {
        const existingTracked = latestAnswerUpdates.get(updateKey);
        if (existingTracked) {
          if (existingTracked.timestamp > reqTimestamp) {
            return { stale: true, freshAttempt };
          }
          if (
            existingTracked.timestamp === reqTimestamp &&
            reqSequence !== null &&
            existingTracked.sequence > reqSequence
          ) {
            return { stale: true, freshAttempt };
          }
        }
      }

      // Determine new values, correctly handling null/cleared answer
      const existingAnswer = await tx.attemptAnswer.findUnique({
        where: {
          attemptId_questionId: {
            attemptId: freshAttempt.id,
            questionId,
          },
        },
      });

      let newSelectedOption = existingAnswer ? existingAnswer.selectedOption : null;
      if (selectedOption !== undefined) {
        newSelectedOption = (selectedOption === null || selectedOption === "") ? null : String(selectedOption);
      }

      let newIsMarkedForReview = existingAnswer ? existingAnswer.isMarkedForReview : false;
      if (typeof isMarkedForReview === "boolean") {
        newIsMarkedForReview = isMarkedForReview;
      }

      const answer = await tx.attemptAnswer.upsert({
        where: {
          attemptId_questionId: {
            attemptId: freshAttempt.id,
            questionId,
          },
        },
        update: {
          selectedOption: newSelectedOption,
          isMarkedForReview: newIsMarkedForReview,
        },
        create: {
          attemptId: freshAttempt.id,
          questionId,
          selectedOption: newSelectedOption,
          isMarkedForReview: newIsMarkedForReview,
        },
      });

      if (reqTimestamp) {
        trackAnswerUpdate(updateKey, reqTimestamp, reqSequence || 0);
      }

      return { stale: false, answer, freshAttempt };
    });

    if (saveResult.stale) {
      return res.json({
        ok: true,
        stale: true,
        message: "Stale answer update ignored.",
        ignored: true,
      });
    }

    if (saveResult.expired) {
      return res.status(403).json({
        message: "Assessment time has expired. Answers can no longer be recorded.",
        code: "EXAM_TIMEOUT",
        serverTime: new Date().toISOString(),
        remainingSeconds: 0,
      });
    }

    const serverNow = new Date();
    const remainingSeconds = saveResult.freshAttempt.deadlineAt
      ? Math.max(
          0,
          Math.floor((new Date(saveResult.freshAttempt.deadlineAt).getTime() - serverNow.getTime()) / 1000)
        )
      : null;

    res.json({
      ok: true,
      answer: saveResult.answer,
      serverTime: serverNow.toISOString(),
      remainingSeconds,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code || "ERROR",
        ...(error.code === "EXAM_TIMEOUT"
          ? { serverTime: new Date().toISOString(), remainingSeconds: 0 }
          : {}),
      });
    }
    console.error("Save answer error:", error);
    res.status(500).json({ message: "Failed to persist answer choice." });
  }
});

/**
 * POST /api/exams/:id/incident
 * Persist an authoritative, timestamped proctoring incident log in PostgreSQL
 */
router.post("/:id/incident", authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.user.userId;
    const { attemptId, type, description, details, metadata } = req.body;

    // 1. Resolve attempt session
    let targetAttempt;
    if (attemptId) {
      const specifiedAttempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
      });
      if (!specifiedAttempt) {
        return res.status(404).json({
          message: "Examination attempt not found.",
          code: "ATTEMPT_NOT_FOUND",
        });
      }
      if (specifiedAttempt.userId !== userId) {
        return res.status(403).json({
          message: "Unauthorized: You do not own this examination session.",
          code: "FORBIDDEN",
        });
      }
      if (specifiedAttempt.examId !== examId) {
        return res.status(400).json({
          message: "Examination attempt does not belong to the specified exam.",
          code: "INVALID_EXAM_SESSION",
        });
      }
      targetAttempt = specifiedAttempt;
    } else {
      const activeAttempts = await prisma.attempt.findMany({
        where: { userId, examId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
      });
      targetAttempt = activeAttempts[0];
    }

    if (!targetAttempt) {
      return res.status(404).json({
        message: "No active examination attempt found to log incident.",
        code: "ATTEMPT_NOT_FOUND",
      });
    }

    // 2. Reject incidents on submitted sessions
    if (targetAttempt.status === "SUBMITTED" || targetAttempt.status === "AUTO_SUBMITTED") {
      return res.status(403).json({
        message: "Incidents cannot be recorded for a completed examination session.",
        code: "ALREADY_SUBMITTED",
      });
    }

    if (targetAttempt.status !== "IN_PROGRESS") {
      return res.status(403).json({
        message: "Examination session is not active.",
        code: "INVALID_SESSION_STATUS",
      });
    }

    // 3. Reject incidents on expired sessions
    if (targetAttempt.deadlineAt && new Date() > new Date(targetAttempt.deadlineAt)) {
      try {
        await autoSubmitAttempt(targetAttempt.id);
      } catch (e) {
        console.error("Auto-submit on incident expiry error:", e);
      }
      return res.status(403).json({
        message: "Assessment time has elapsed. Incidents can no longer be recorded.",
        code: "EXAM_TIMEOUT",
      });
    }

    // 4. Validate and normalize incident type
    const validTypes = new Set([
      "WINDOW_BLUR",
      "FULLSCREEN_EXIT",
      "CAMERA_STOPPED",
      "MICROPHONE_STOPPED",
      "SCREEN_SHARING_STOPPED",
      "OTHER",
    ]);

    let validatedType = String(type || "").trim().toUpperCase();
    if (!validTypes.has(validatedType)) {
      if (
        validatedType === "BLUR" ||
        validatedType === "TAB_SWITCH" ||
        validatedType === "VISIBILITY_HIDDEN" ||
        validatedType === "WINDOW_FOCUS_LOST"
      ) {
        validatedType = "WINDOW_BLUR";
      } else if (
        validatedType === "FULLSCREEN_LEAVE" ||
        validatedType === "FULLSCREEN" ||
        validatedType === "EXIT_FULLSCREEN"
      ) {
        validatedType = "FULLSCREEN_EXIT";
      } else {
        validatedType = "OTHER";
      }
    }

    // 5. Server-side deduplication within 2 seconds for identical event on same attempt
    const recentDuplicate = await prisma.proctoringIncident.findFirst({
      where: {
        attemptId: targetAttempt.id,
        type: validatedType,
        occurredAt: { gte: new Date(Date.now() - 2000) },
      },
      orderBy: { occurredAt: "desc" },
    });

    if (recentDuplicate) {
      return res.json({
        ok: true,
        deduplicated: true,
        incident: recentDuplicate,
      });
    }

    // 6. Persist authoritative timestamped incident
    const serverTimestamp = new Date();
    const eventDescription = description || details || null;
    const incident = await prisma.proctoringIncident.create({
      data: {
        attemptId: targetAttempt.id,
        type: validatedType,
        description: eventDescription ? String(eventDescription).slice(0, 500) : null,
        metadata: metadata && typeof metadata === "object" ? metadata : null,
        occurredAt: serverTimestamp,
      },
    });

    res.status(201).json({
      ok: true,
      incident,
    });
  } catch (error) {
    console.error("Record proctoring incident error:", error);
    res.status(500).json({ message: "Failed to persist proctoring incident log." });
  }
});

/**
 * GET /api/exams/:id/incidents
 * Retrieve authoritative timestamped proctoring incident logs for an attempt
 */
router.get("/:id/incidents", authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.user.userId;
    const { attemptId } = req.query;

    let targetAttempt;
    if (attemptId) {
      const specifiedAttempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
      });
      if (!specifiedAttempt) {
        return res.status(404).json({ message: "Examination attempt not found." });
      }
      if (specifiedAttempt.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized: You do not own this examination session." });
      }
      if (specifiedAttempt.examId !== examId) {
        return res.status(400).json({ message: "Examination attempt does not belong to the specified exam." });
      }
      targetAttempt = specifiedAttempt;
    } else {
      const attempts = await prisma.attempt.findMany({
        where: { userId, examId },
        orderBy: { startedAt: "desc" },
      });
      targetAttempt = attempts[0];
    }

    if (!targetAttempt) {
      return res.json({ incidents: [], count: 0 });
    }

    const incidents = await prisma.proctoringIncident.findMany({
      where: { attemptId: targetAttempt.id },
      orderBy: { occurredAt: "asc" },
    });

    res.json({
      attemptId: targetAttempt.id,
      incidents,
      count: incidents.length,
    });
  } catch (error) {
    console.error("Retrieve proctoring incidents error:", error);
    res.status(500).json({ message: "Failed to retrieve proctoring incident logs." });
  }
});

/**
 * POST /api/exams/:id/submit
 * Conclude assessment, grade answers, and persist result in PostgreSQL
 */
router.post("/:id/submit", authenticateToken, async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.user.userId;
    const { answers, isTimeout, attemptId } = req.body;

    // Security check: Verify session ownership if attemptId was passed
    if (attemptId) {
      const specifiedAttempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
      });
      if (!specifiedAttempt) {
        return res.status(404).json({
          message: "Examination attempt not found.",
          code: "ATTEMPT_NOT_FOUND",
        });
      }
      if (specifiedAttempt.userId !== userId) {
        return res.status(403).json({
          message: "Unauthorized: You do not own this examination session.",
          code: "FORBIDDEN",
        });
      }
      if (specifiedAttempt.examId !== examId) {
        return res.status(400).json({
          message: "Examination attempt does not belong to the specified exam.",
          code: "INVALID_EXAM_SESSION",
        });
      }
    }

    // Use transaction for safe atomic submission, locking, and grading
    const graded = await prisma.$transaction(async (tx) => {
      // Find attempt to submit
      let targetAttemptId = attemptId;
      if (!targetAttemptId) {
        const active = await tx.attempt.findFirst({
          where: { userId, examId, status: "IN_PROGRESS" },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        });

        if (!active) {
          // Check for previously submitted attempt to return idempotently
          const submitted = await tx.attempt.findFirst({
            where: {
              userId,
              examId,
              status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
            },
            orderBy: { submittedAt: "desc" },
            include: { result: true },
          });

          if (submitted) {
            let resObj = submitted.result;
            if (!resObj) {
              resObj = await autoSubmitAttempt(submitted.id, tx);
            }
            return {
              isDuplicate: true,
              result: resObj,
              attempt: submitted,
            };
          }

          throw { status: 404, message: "No active examination attempt found to submit." };
        }
        targetAttemptId = active.id;
      }

      // Row-level lock on Attempt in PostgreSQL: serializes concurrent submit requests
      await tx.$queryRaw`SELECT id FROM "Attempt" WHERE id = ${targetAttemptId} FOR UPDATE`;

      const fullAttempt = await tx.attempt.findUnique({
        where: { id: targetAttemptId },
        include: {
          exam: {
            include: { questions: { orderBy: { order: "asc" } } },
          },
          answers: true,
          result: true,
        },
      });

      if (!fullAttempt) {
        throw { status: 404, message: "Examination attempt not found." };
      }

      if (fullAttempt.userId !== userId) {
        throw {
          status: 403,
          code: "FORBIDDEN",
          message: "Unauthorized: You do not own this examination session.",
        };
      }

      if (fullAttempt.examId !== examId) {
        throw {
          status: 400,
          code: "INVALID_EXAM_SESSION",
          message: "Examination attempt does not belong to the specified exam.",
        };
      }

      // Idempotent: If already submitted, return the existing result directly
      if (fullAttempt.status === "SUBMITTED" || fullAttempt.status === "AUTO_SUBMITTED") {
        let existingResult = fullAttempt.result;
        if (!existingResult) {
          existingResult = await autoSubmitAttempt(fullAttempt.id, tx);
        }
        return {
          isDuplicate: true,
          result: existingResult,
          attempt: fullAttempt,
        };
      }

      const isExpired =
        Boolean(fullAttempt.deadlineAt) && new Date() > new Date(fullAttempt.deadlineAt);
      const isAutoSubmitted = Boolean(isTimeout) || isExpired;

      // Persist any final answers passed in body ONLY IF NOT expired
      if (!isAutoSubmitted && answers && typeof answers === "object") {
        const validQuestionIds = new Set((fullAttempt.exam.questions || []).map((q) => q.id));

        for (const [qId, optVal] of Object.entries(answers)) {
          if (!validQuestionIds.has(qId)) continue;

          const cleanOption =
            optVal === null || optVal === undefined || optVal === "" ? null : String(optVal);
          await tx.attemptAnswer.upsert({
            where: {
              attemptId_questionId: {
                attemptId: fullAttempt.id,
                questionId: qId,
              },
            },
            update: {
              selectedOption: cleanOption,
            },
            create: {
              attemptId: fullAttempt.id,
              questionId: qId,
              selectedOption: cleanOption,
            },
          });
        }
      }

      // Re-fetch all saved answers to grade authoritatively against persisted state
      const allAnswers = await tx.attemptAnswer.findMany({
        where: { attemptId: fullAttempt.id },
      });

      const answersMap = {};
      allAnswers.forEach((a) => {
        answersMap[a.questionId] = a.selectedOption;
      });

      const questions = fullAttempt.exam.questions || [];
      const grading = calculateGrading(questions, answersMap, fullAttempt.exam);

      // Upsert Result record
      const savedResult = await tx.result.upsert({
        where: { attemptId: fullAttempt.id },
        update: {
          score: grading.score,
          totalMarks: grading.totalMarks,
          correctCount: grading.correctCount,
          wrongCount: grading.wrongCount,
          unansweredCount: grading.unansweredCount,
          calculatedAt: new Date(),
        },
        create: {
          attemptId: fullAttempt.id,
          score: grading.score,
          totalMarks: grading.totalMarks,
          correctCount: grading.correctCount,
          wrongCount: grading.wrongCount,
          unansweredCount: grading.unansweredCount,
        },
      });

      // Update Attempt status to SUBMITTED or AUTO_SUBMITTED
      const concludedAttempt = await tx.attempt.update({
        where: { id: fullAttempt.id },
        data: {
          status: isAutoSubmitted ? "AUTO_SUBMITTED" : "SUBMITTED",
          submittedAt: new Date(),
        },
      });

      return {
        isDuplicate: false,
        result: savedResult,
        attempt: concludedAttempt,
      };
    });

    const percentage = Number(((graded.result.score / graded.result.totalMarks) * 100).toFixed(1));
    const passed = percentage >= 40.0;

    res.json({
      message: graded.isDuplicate
        ? "Submission already recorded."
        : "Examination successfully submitted and graded.",
      result: {
        ...graded.result,
        percentage,
        passed,
      },
      attempt: graded.attempt,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Submit exam error:", error);
    res.status(500).json({ message: "Failed to submit and grade examination." });
  }
});

module.exports = router;
