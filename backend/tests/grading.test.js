require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const assert = require("assert");
const prisma = require("../prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { evaluateAnswer, calculateGrading, isAnswerProvided } = require("../utils/grading");

const JWT_SECRET = process.env.JWT_SECRET || "iUg+BrFygBiTG0isaq3vHxohHZ8QesXeTLXgE6iUCTw=";

async function runTests() {
  console.log("=================================================");
  console.log("  Athena Day 5, Commit 1 - Grading Verification  ");
  console.log("=================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  PASS: ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error("   ", err.message);
      failedCount++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  PASS: ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error("   ", err.message);
      failedCount++;
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: Unit Tests for isAnswerProvided and evaluateAnswer
  // --------------------------------------------------------------------------
  console.log("--- Section 1: Answer Evaluation Unit Tests ---");

  test("isAnswerProvided correctly identifies answered vs unanswered", () => {
    assert.strictEqual(isAnswerProvided(null), false);
    assert.strictEqual(isAnswerProvided(undefined), false);
    assert.strictEqual(isAnswerProvided(""), false);
    assert.strictEqual(isAnswerProvided("   "), false);
    assert.strictEqual(isAnswerProvided("null"), false);
    assert.strictEqual(isAnswerProvided("undefined"), false);
    assert.strictEqual(isAnswerProvided(0), true);
    assert.strictEqual(isAnswerProvided("0"), true);
    assert.strictEqual(isAnswerProvided("1"), true);
    assert.strictEqual(isAnswerProvided("CAP Theorem"), true);
  });

  test("evaluateAnswer evaluates exact string match", () => {
    const q = { correctAnswer: "0", options: ["A", "B", "C"] };
    assert.deepStrictEqual(evaluateAnswer("0", q), { isAnswered: true, isCorrect: true });
    assert.deepStrictEqual(evaluateAnswer(0, q), { isAnswered: true, isCorrect: true });
    assert.deepStrictEqual(evaluateAnswer("1", q), { isAnswered: true, isCorrect: false });
  });

  test("evaluateAnswer evaluates option text against index correctAnswer", () => {
    const q = {
      correctAnswer: "0",
      options: ["CAP Theorem (Brewer's Theorem)", "Byzantine Generals", "Amdahl's Law"],
    };
    // Candidate passes option text
    assert.deepStrictEqual(evaluateAnswer("CAP Theorem (Brewer's Theorem)", q), {
      isAnswered: true,
      isCorrect: true,
    });
    // Candidate passes wrong option text
    assert.deepStrictEqual(evaluateAnswer("Byzantine Generals", q), {
      isAnswered: true,
      isCorrect: false,
    });
  });

  test("evaluateAnswer evaluates option index against text correctAnswer", () => {
    const q = {
      correctAnswer: "CAP Theorem (Brewer's Theorem)",
      options: ["CAP Theorem (Brewer's Theorem)", "Byzantine Generals", "Amdahl's Law"],
    };
    assert.deepStrictEqual(evaluateAnswer("0", q), { isAnswered: true, isCorrect: true });
    assert.deepStrictEqual(evaluateAnswer(0, q), { isAnswered: true, isCorrect: true });
    assert.deepStrictEqual(evaluateAnswer("1", q), { isAnswered: true, isCorrect: false });
  });

  test("evaluateAnswer handles whitespace and case insensitivity", () => {
    const q = { correctAnswer: "tcp", options: ["TCP", "UDP", "ICMP"] };
    assert.deepStrictEqual(evaluateAnswer(" TCP ", q), { isAnswered: true, isCorrect: true });
    assert.deepStrictEqual(evaluateAnswer("0", q), { isAnswered: true, isCorrect: true });
  });

  test("evaluateAnswer safely handles null or empty answers", () => {
    const q = { correctAnswer: "0", options: ["A", "B"] };
    assert.deepStrictEqual(evaluateAnswer(null, q), { isAnswered: false, isCorrect: false });
    assert.deepStrictEqual(evaluateAnswer("", q), { isAnswered: false, isCorrect: false });
    assert.deepStrictEqual(evaluateAnswer(undefined, q), { isAnswered: false, isCorrect: false });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Unit Tests for calculateGrading
  // --------------------------------------------------------------------------
  console.log("\n--- Section 2: Scoring Calculation Unit Tests ---");

  const mockQuestions = [
    { id: "q1", marks: 25, correctAnswer: "0", options: ["Opt 0", "Opt 1"] },
    { id: "q2", marks: 25, correctAnswer: "1", options: ["Opt 0", "Opt 1"] },
    { id: "q3", marks: 25, correctAnswer: "0", options: ["Opt 0", "Opt 1"] },
    { id: "q4", marks: 25, correctAnswer: "0", options: ["Opt 0", "Opt 1"] },
  ];
  const mockExam = { totalMarks: 100, negativeMarking: 0.5 };

  test("calculateGrading: fully correct submission gives 100%", () => {
    const answers = { q1: "0", q2: "1", q3: "0", q4: "0" };
    const res = calculateGrading(mockQuestions, answers, mockExam);
    assert.strictEqual(res.score, 100);
    assert.strictEqual(res.totalMarks, 100);
    assert.strictEqual(res.correctCount, 4);
    assert.strictEqual(res.wrongCount, 0);
    assert.strictEqual(res.unansweredCount, 0);
    assert.strictEqual(res.percentage, 100.0);
    assert.strictEqual(res.passed, true);
  });

  test("calculateGrading: partially correct with negative marking", () => {
    // 2 correct (2*25 = 50), 1 wrong (-0.5 = 49.5), 1 unanswered (0)
    const answers = { q1: "0", q2: "1", q3: "1", q4: null };
    const res = calculateGrading(mockQuestions, answers, mockExam);
    assert.strictEqual(res.score, 49.5);
    assert.strictEqual(res.totalMarks, 100);
    assert.strictEqual(res.correctCount, 2);
    assert.strictEqual(res.wrongCount, 1);
    assert.strictEqual(res.unansweredCount, 1);
    assert.strictEqual(res.percentage, 49.5);
    assert.strictEqual(res.passed, true);
  });

  test("calculateGrading: all unanswered gives 0 score without negative penalty", () => {
    const answers = {};
    const res = calculateGrading(mockQuestions, answers, mockExam);
    assert.strictEqual(res.score, 0);
    assert.strictEqual(res.correctCount, 0);
    assert.strictEqual(res.wrongCount, 0);
    assert.strictEqual(res.unansweredCount, 4);
    assert.strictEqual(res.percentage, 0);
    assert.strictEqual(res.passed, false);
  });

  test("calculateGrading: all incorrect floors score safely at 0", () => {
    const answers = { q1: "1", q2: "0", q3: "1", q4: "1" };
    const res = calculateGrading(mockQuestions, answers, mockExam);
    assert.strictEqual(res.score, 0); // Math.max(0, -2.0) = 0
    assert.strictEqual(res.correctCount, 0);
    assert.strictEqual(res.wrongCount, 4);
    assert.strictEqual(res.unansweredCount, 0);
    assert.strictEqual(res.passed, false);
  });

  test("calculateGrading: handles exam with zero negativeMarking", () => {
    const answers = { q1: "0", q2: "0" }; // q1 correct (25), q2 wrong (0), q3 & q4 unanswered (0)
    const res = calculateGrading(mockQuestions, answers, { totalMarks: 100, negativeMarking: 0 });
    assert.strictEqual(res.score, 25);
    assert.strictEqual(res.correctCount, 1);
    assert.strictEqual(res.wrongCount, 1);
    assert.strictEqual(res.unansweredCount, 2);
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Integration Tests with PostgreSQL & Prisma Database
  // --------------------------------------------------------------------------
  console.log("\n--- Section 3: Database & Route Integration Tests ---");

  const testUserIds = [];
  const testAttemptIds = [];

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: "cs-401" },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    assert(exam, "Target exam cs-401 must exist in the database");
    assert.strictEqual(exam.questions.length, 4, "cs-401 must have 4 questions");

    // Helper to create test candidate
    async function createTestCandidate(suffix) {
      const email = `test_candidate_${suffix}_${Date.now()}@athena.internal`;
      const passwordHash = await bcrypt.hash("Password123!", 8);
      const user = await prisma.user.create({
        data: {
          name: `Test Candidate ${suffix}`,
          email,
          passwordHash,
          role: "STUDENT",
        },
      });
      testUserIds.push(user.id);
      const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET);
      return { user, token };
    }

    // Helper to create in-progress attempt
    async function createTestAttempt(userId) {
      const now = new Date();
      const attempt = await prisma.attempt.create({
        data: {
          userId,
          examId: "cs-401",
          status: "IN_PROGRESS",
          startedAt: now,
          deadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
        },
      });
      testAttemptIds.push(attempt.id);
      return attempt;
    }

    // Express App instance for testing routes
    const express = require("express");
    const app = express();
    app.use(express.json());
    app.use("/api/exams", require("../routes/exams"));

    // Simple fetch simulator using Node http
    const http = require("http");
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/exams`;

    async function apiRequest(endpoint, method = "GET", body = null, token = null) {
      const url = `${baseUrl}${endpoint}`;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    // TEST 1: Fully correct submission
    await asyncTest("Integration: Fully correct submission calculates and persists 100 marks", async () => {
      const { user, token } = await createTestCandidate("full_correct");
      const attempt = await createTestAttempt(user.id);

      // cs-401 answers: Q1: "0", Q2: "1", Q3: "0", Q4: "0"
      const correctAnswers = {};
      exam.questions.forEach((q) => {
        correctAnswers[q.id] = q.correctAnswer;
      });

      const res = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        answers: correctAnswers,
      }, token);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.result.score, 100);
      assert.strictEqual(res.data.result.totalMarks, 100);
      assert.strictEqual(res.data.result.correctCount, 4);
      assert.strictEqual(res.data.result.wrongCount, 0);
      assert.strictEqual(res.data.result.unansweredCount, 0);
      assert.strictEqual(res.data.result.passed, true);

      // Check PostgreSQL DB state
      const dbResult = await prisma.result.findUnique({
        where: { attemptId: attempt.id },
      });
      assert(dbResult, "Result record must exist in PostgreSQL");
      assert.strictEqual(dbResult.score, 100);
      assert.strictEqual(dbResult.correctCount, 4);

      const dbAttempt = await prisma.attempt.findUnique({
        where: { id: attempt.id },
      });
      assert.strictEqual(dbAttempt.status, "SUBMITTED");
      assert(dbAttempt.submittedAt, "submittedAt must be set");
    });

    // TEST 2: Duplicate submission protection (Idempotency)
    await asyncTest("Integration: Repeated submission does not duplicate results or re-grade", async () => {
      const { user, token } = await createTestCandidate("idempotent");
      const attempt = await createTestAttempt(user.id);

      const answers = { [exam.questions[0].id]: exam.questions[0].correctAnswer };

      // First submit
      const res1 = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        answers,
      }, token);
      assert.strictEqual(res1.status, 200);
      const initialScore = res1.data.result.score;

      // Second submit with different answers attempted
      const res2 = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        answers: { [exam.questions[1].id]: exam.questions[1].correctAnswer },
      }, token);

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.message, "Submission already recorded.");
      assert.strictEqual(res2.data.result.score, initialScore);

      // Verify only ONE Result row exists in PostgreSQL
      const results = await prisma.result.findMany({
        where: { attemptId: attempt.id },
      });
      assert.strictEqual(results.length, 1, "Exactly one Result record must exist");
    });

    // TEST 3: Partially correct submission with negative marking
    await asyncTest("Integration: Partially correct submission applies question marks & negative marking", async () => {
      const { user, token } = await createTestCandidate("partial");
      const attempt = await createTestAttempt(user.id);

      // Q1: correct (25 marks)
      // Q2: correct (25 marks)
      // Q3: wrong (deducts 0.5)
      // Q4: unanswered (0)
      // Expected score: 50 - 0.5 = 49.5
      const answers = {
        [exam.questions[0].id]: exam.questions[0].correctAnswer,
        [exam.questions[1].id]: exam.questions[1].correctAnswer,
        [exam.questions[2].id]: "999", // wrong
      };

      const res = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        answers,
      }, token);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.result.score, 49.5);
      assert.strictEqual(res.data.result.correctCount, 2);
      assert.strictEqual(res.data.result.wrongCount, 1);
      assert.strictEqual(res.data.result.unansweredCount, 1);
      assert.strictEqual(res.data.result.passed, true);

      // Verify DB record
      const dbResult = await prisma.result.findUnique({
        where: { attemptId: attempt.id },
      });
      assert.strictEqual(dbResult.score, 49.5);
      assert.strictEqual(dbResult.correctCount, 2);
      assert.strictEqual(dbResult.wrongCount, 1);
      assert.strictEqual(dbResult.unansweredCount, 1);
    });

    // TEST 4: All incorrect & unanswered questions
    await asyncTest("Integration: Incorrect and unanswered questions safely handled and floored", async () => {
      const { user, token } = await createTestCandidate("incorrect_unanswered");
      const attempt = await createTestAttempt(user.id);

      // Q1: wrong
      // Q2: wrong
      // Q3: unanswered
      // Q4: unanswered
      const answers = {
        [exam.questions[0].id]: "999",
        [exam.questions[1].id]: "999",
      };

      const res = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        answers,
      }, token);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.result.score, 0); // floored at 0
      assert.strictEqual(res.data.result.correctCount, 0);
      assert.strictEqual(res.data.result.wrongCount, 2);
      assert.strictEqual(res.data.result.unansweredCount, 2);
      assert.strictEqual(res.data.result.passed, false);
    });

    // TEST 5: Security - Session ownership validation
    await asyncTest("Integration: Candidate cannot submit attempt belonging to another candidate", async () => {
      const { user: userA } = await createTestCandidate("owner_a");
      const { token: tokenB } = await createTestCandidate("attacker_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attemptA.id,
        answers: {},
      }, tokenB);

      assert.strictEqual(res.status, 403);
    });

    // TEST 6: Security - Frontend cannot tamper with or submit score
    await asyncTest("Integration: Server ignores client-supplied score in submit payload", async () => {
      const { user, token } = await createTestCandidate("tamper_score");
      const attempt = await createTestAttempt(user.id);

      // Client tries to inject score: 9999 with 0 correct answers
      const res = await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        score: 9999,
        totalMarks: 9999,
        correctCount: 999,
        answers: {
          [exam.questions[0].id]: "999", // wrong
        },
      }, token);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.result.score, 0);
      assert.strictEqual(res.data.result.totalMarks, 100);
      assert.strictEqual(res.data.result.correctCount, 0);
    });

    // TEST 7: Past Results API consistency
    await asyncTest("Integration: Past results API returns authoritative score and breakdown", async () => {
      const { user, token } = await createTestCandidate("past_results");
      const attempt = await createTestAttempt(user.id);

      // Submit fully correct
      const correctAnswers = {};
      exam.questions.forEach((q) => {
        correctAnswers[q.id] = q.correctAnswer;
      });
      await apiRequest(`/cs-401/submit`, "POST", {
        attemptId: attempt.id,
        answers: correctAnswers,
      }, token);

      // Fetch past results
      const res = await apiRequest(`/results/my-results`, "GET", null, token);
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.data.results));
      assert.strictEqual(res.data.results.length, 1);
      const pastItem = res.data.results[0];
      assert.strictEqual(pastItem.score, 100);
      assert.strictEqual(pastItem.correctCount, 4);
      assert.strictEqual(pastItem.wrongCount, 0);
      assert.strictEqual(pastItem.unansweredCount, 0);
      assert.strictEqual(pastItem.percentage, 100);

      // Fetch detailed result
      const detailRes = await apiRequest(`/results/${attempt.id}`, "GET", null, token);
      assert.strictEqual(detailRes.status, 200);
      assert.strictEqual(detailRes.data.score, 100);
      assert.strictEqual(detailRes.data.questions.length, 4);
      assert(detailRes.data.questions.every((q) => q.isCorrect));
    });

    server.close();
  } finally {
    // Cleanup created test records so database remains pristine
    if (testAttemptIds.length > 0) {
      await prisma.result.deleteMany({ where: { attemptId: { in: testAttemptIds } } });
      await prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: testAttemptIds } } });
      await prisma.attempt.deleteMany({ where: { id: { in: testAttemptIds } } });
    }
    if (testUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    }
  }

  console.log("\n=================================================");
  console.log(`  Tests completed: ${passedCount} passed, ${failedCount} failed`);
  console.log("=================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
