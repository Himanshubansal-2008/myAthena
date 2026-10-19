const express = require("express");
const prisma = require("../prisma");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * Authoritatively grades an attempt, persists its Result record,
 * and sets status to AUTO_SUBMITTED with submittedAt timestamp.
 * Idempotent: returns existing result if already calculated.
 */
async function autoSubmitAttempt(attemptId, externalTx = null) {
  const runner = async (tx) => {
    const fullAttempt = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { questions: true } },
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
    let totalMarks = fullAttempt?.exam?.totalMarks || 100;
    let negativeMarking = fullAttempt?.exam?.negativeMarking || 0;
    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    questions.forEach((q) => {
      const candidateChoice = answersMap[q.id];
      if (candidateChoice === undefined || candidateChoice === null || candidateChoice === "") {
        unansweredCount++;
      } else {
        const isCorrect =
          String(candidateChoice) === String(q.correctAnswer) ||
          (Array.isArray(q.options) && q.options[Number(candidateChoice)] === q.correctAnswer);
        if (isCorrect) {
          correctCount++;
          score += q.marks;
        } else {
          wrongCount++;
          score -= negativeMarking;
        }
      }
    });

    const finalScore = Math.max(0, Number(score.toFixed(2)));

    const result = await tx.result.upsert({
      where: { attemptId },
      update: {
        score: finalScore,
        totalMarks,
        correctCount,
        wrongCount,
        unansweredCount,
        calculatedAt: new Date(),
      },
      create: {
        attemptId,
        score: finalScore,
        totalMarks,
        correctCount,
        wrongCount,
        unansweredCount,
      },
    });

    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: "AUTO_SUBMITTED",
        submittedAt: new Date(),
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
        _count: {
          select: { incidents: true },
        },
      },
    });

    const results = attempts.map((att) => {
      const resData = att.result || {
        score: 0,
        totalMarks: att.exam.totalMarks || 100,
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
      };

      const percentage = Number(((resData.score / resData.totalMarks) * 100).toFixed(1));

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
        incidentCount: att._count.incidents,
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
      return res.status(400).json({ message: "Examination results are still pending calculation." });
    }

    const answersMap = {};
    attempt.answers.forEach((ans) => {
      answersMap[ans.questionId] = ans.selectedOption;
    });

    const questionReviews = attempt.exam.questions.map((q) => {
      const selectedOption = answersMap[q.id];
      const isAnswered = selectedOption !== undefined && selectedOption !== null && selectedOption !== "";

      const isCorrect = isAnswered && (
        String(selectedOption) === String(q.correctAnswer) ||
        (Array.isArray(q.options) && q.options[Number(selectedOption)] === q.correctAnswer)
      );

      return {
        id: q.id,
        order: q.order,
        text: q.text,
        options: q.options,
        selectedOption: isAnswered ? selectedOption : null,
        correctAnswer: q.correctAnswer,
        isAnswered,
        isCorrect,
        marks: q.marks,
      };
    });

    const percentage = Number(((attempt.result.score / attempt.result.totalMarks) * 100).toFixed(1));
    res.json({
      attemptId: attempt.id,
      examId: attempt.exam.id,
      examTitle: attempt.exam.title,
      examCode: attempt.exam.id.toUpperCase(),
      department: attempt.exam.description,
      submittedAt: attempt.submittedAt,
      score: attempt.result.score,
      totalMarks: attempt.result.totalMarks,
      percentage,
      status: "COMPLETED",
      correctCount: attempt.result.correctCount,
      wrongCount: attempt.result.wrongCount,
      unansweredCount: attempt.result.unansweredCount,
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
    const isStudent = req.user.role !== "ADMIN";
    const exams = await prisma.exam.findMany({
      where: isStudent ? { status: "PUBLISHED" } : {},
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

    const payload = exams.map((exam) => {
      const userAttempt = attemptsByUser[exam.id];
      const isSubmitted = userAttempt?.status === "SUBMITTED" || userAttempt?.status === "AUTO_SUBMITTED";
      const isInProgress = userAttempt?.status === "IN_PROGRESS";

      return {
        ...exam,
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
        canAttempt: !isSubmitted,
      };
    });

    res.json({ exams: payload });
  } catch (error) {
    console.error("List exams error:", error);
    res.status(500).json({ message: "Unable to retrieve examinations." });
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
    if (exam.status !== "PUBLISHED" && req.user.role !== "ADMIN") {
      return res.status(403).json({
        message: "This examination is not published or currently accessible.",
        code: "EXAM_NOT_AVAILABLE",
      });
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

    res.json({
      serverTime: serverNow.toISOString(),
      exam: examPayload,
      questions,
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

    const attempts = await prisma.attempt.findMany({
      where: { userId, examId },
      orderBy: { startedAt: "desc" },
      include: { result: true },
    });

    const submitted = attempts.find(
      (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"
    );

    if (submitted) {
      return res.json({
        serverTime: new Date().toISOString(),
        attemptId: submitted.id,
        status: submitted.status,
        isExpired: true,
        remainingSeconds: 0,
        result: submitted.result,
      });
    }

    const activeAttempt = attempts.find((a) => a.status === "IN_PROGRESS");
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
    const existingAttempts = await prisma.attempt.findMany({
      where: {
        userId,
        examId,
      },
      orderBy: { startedAt: "desc" },
    });

    // If attemptId was passed, match that specific attempt; otherwise target most recent
    const targetAttempt = attemptId
      ? existingAttempts.find((a) => a.id === attemptId)
      : existingAttempts[0];

    if (!targetAttempt) {
      return res.status(404).json({
        message: "Examination attempt not found.",
        code: "ATTEMPT_NOT_FOUND",
      });
    }

    // Server-side check: Reject modifications to submitted sessions
    if (targetAttempt.status === "SUBMITTED" || targetAttempt.status === "AUTO_SUBMITTED") {
      return res.status(403).json({
        message: "Modifications to submitted examination sessions are rejected.",
        code: "ALREADY_SUBMITTED",
      });
    }

    if (targetAttempt.status !== "IN_PROGRESS") {
      return res.status(403).json({
        message: "Examination session is not active.",
        code: "INVALID_SESSION_STATUS",
      });
    }

    if (targetAttempt.deadlineAt && new Date() > new Date(targetAttempt.deadlineAt)) {
      try {
        await autoSubmitAttempt(targetAttempt.id);
      } catch (e) {
        console.error("Auto submit on answer expiry error:", e);
      }

      return res.status(403).json({
        message: "Assessment time has expired. Answers can no longer be recorded.",
        code: "EXAM_TIMEOUT",
        serverTime: new Date().toISOString(),
        remainingSeconds: 0,
      });
    }

    // Prevent rapid answer changes from overwriting newer answers due to network races
    const updateKey = `${targetAttempt.id}:${questionId}`;
    const reqTimestamp = clientTimestamp ? Number(clientTimestamp) : null;
    const reqSequence = sequence !== undefined && sequence !== null ? Number(sequence) : null;

    if (reqTimestamp) {
      const existingTracked = latestAnswerUpdates.get(updateKey);
      if (existingTracked) {
        if (existingTracked.timestamp > reqTimestamp) {
          return res.json({
            ok: true,
            stale: true,
            message: "Stale answer update ignored.",
            ignored: true,
          });
        }
        if (existingTracked.timestamp === reqTimestamp && reqSequence !== null && existingTracked.sequence > reqSequence) {
          return res.json({
            ok: true,
            stale: true,
            message: "Stale answer update ignored.",
            ignored: true,
          });
        }
      }
    }

    // Determine new values, correctly handling null/cleared answer
    const existingAnswer = await prisma.attemptAnswer.findUnique({
      where: {
        attemptId_questionId: {
          attemptId: targetAttempt.id,
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

    const answer = await prisma.attemptAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId: targetAttempt.id,
          questionId,
        },
      },
      update: {
        selectedOption: newSelectedOption,
        isMarkedForReview: newIsMarkedForReview,
      },
      create: {
        attemptId: targetAttempt.id,
        questionId,
        selectedOption: newSelectedOption,
        isMarkedForReview: newIsMarkedForReview,
      },
    });

    if (reqTimestamp) {
      trackAnswerUpdate(updateKey, reqTimestamp, reqSequence || 0);
    }

    const serverNow = new Date();
    const remainingSeconds = targetAttempt.deadlineAt
      ? Math.max(0, Math.floor((new Date(targetAttempt.deadlineAt).getTime() - serverNow.getTime()) / 1000))
      : null;

    res.json({
      ok: true,
      answer,
      serverTime: serverNow.toISOString(),
      remainingSeconds,
    });
  } catch (error) {
    console.error("Save answer error:", error);
    res.status(500).json({ message: "Failed to persist answer choice." });
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
    const { answers, isTimeout } = req.body;

    // Use transaction for safe atomic submission and grading
    const graded = await prisma.$transaction(async (tx) => {
      // Find attempts
      const attempts = await tx.attempt.findMany({
        where: {
          userId,
          examId,
        },
        orderBy: { startedAt: "desc" },
        include: {
          exam: {
            include: { questions: true },
          },
          answers: true,
          result: true,
        },
      });

      const submittedAttempt = attempts.find(
        (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"
      );

      // Idempotent: If already submitted, return the existing result directly
      if (submittedAttempt && submittedAttempt.result) {
        return {
          isDuplicate: true,
          result: submittedAttempt.result,
          attempt: submittedAttempt,
        };
      }

      const activeAttempt = attempts.find((a) => a.status === "IN_PROGRESS");
      if (!activeAttempt) {
        throw { status: 404, message: "No active examination attempt found to submit." };
      }

      const isExpired =
        Boolean(activeAttempt.deadlineAt) && new Date() > new Date(activeAttempt.deadlineAt);
      const isAutoSubmitted = Boolean(isTimeout) || isExpired;

      // Persist any final answers passed in body ONLY IF NOT expired
      if (!isAutoSubmitted && answers && typeof answers === "object") {
        for (const [qId, optVal] of Object.entries(answers)) {
          if (optVal !== undefined && optVal !== null) {
            await tx.attemptAnswer.upsert({
              where: {
                attemptId_questionId: {
                  attemptId: activeAttempt.id,
                  questionId: qId,
                },
              },
              update: {
                selectedOption: String(optVal),
              },
              create: {
                attemptId: activeAttempt.id,
                questionId: qId,
                selectedOption: String(optVal),
              },
            });
          }
        }
      }

      // Re-fetch all saved answers
      const allAnswers = await tx.attemptAnswer.findMany({
        where: { attemptId: activeAttempt.id },
      });

      const answersMap = {};
      allAnswers.forEach((a) => {
        answersMap[a.questionId] = a.selectedOption;
      });

      const questions = activeAttempt.exam.questions;
      let totalMarks = activeAttempt.exam.totalMarks || 100;
      let negativeMarking = activeAttempt.exam.negativeMarking || 0;
      let score = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;

      questions.forEach((q) => {
        const candidateChoice = answersMap[q.id];

        if (candidateChoice === undefined || candidateChoice === null || candidateChoice === "") {
          unansweredCount++;
        } else {
          const isCorrect =
            String(candidateChoice) === String(q.correctAnswer) ||
            (Array.isArray(q.options) && q.options[Number(candidateChoice)] === q.correctAnswer);

          if (isCorrect) {
            correctCount++;
            score += q.marks;
          } else {
            wrongCount++;
            score -= negativeMarking;
          }
        }
      });

      const finalScore = Math.max(0, Number(score.toFixed(2)));

      // Upsert Result record
      const savedResult = await tx.result.upsert({
        where: { attemptId: activeAttempt.id },
        update: {
          score: finalScore,
          totalMarks,
          correctCount,
          wrongCount,
          unansweredCount,
          calculatedAt: new Date(),
        },
        create: {
          attemptId: activeAttempt.id,
          score: finalScore,
          totalMarks,
          correctCount,
          wrongCount,
          unansweredCount,
        },
      });

      // Update Attempt status to SUBMITTED or AUTO_SUBMITTED
      const concludedAttempt = await tx.attempt.update({
        where: { id: activeAttempt.id },
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
