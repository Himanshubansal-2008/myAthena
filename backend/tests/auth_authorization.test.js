require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const assert = require("assert");
const prisma = require("../prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const http = require("http");
const { JWT_SECRET } = require("../middleware/authMiddleware");

async function runTests() {
  console.log("=================================================");
  console.log("  Athena Day 6, Commit 1 - Auth & Authorization  ");
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

  const testUserIds = [];
  const testAttemptIds = [];
  const testExamIds = [];

  // Set up Express test server with all backend routers
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("../routes/auth"));
  app.use("/api/users", require("../routes/user"));
  app.use("/api/exams", require("../routes/exams"));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  async function request(path, method = "GET", body = null, token = null) {
    const url = `${baseUrl}${path}`;
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

  try {
    // Ensure base exam cs-401 exists
    const exam = await prisma.exam.findUnique({
      where: { id: "cs-401" },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    assert(exam, "Target exam cs-401 must exist in the database");

    // Create a creator user for test exams
    const creatorEmail = `creator_test_${Date.now()}@athena.internal`;
    const creatorUser = await prisma.user.create({
      data: {
        name: "Creator User",
        email: creatorEmail,
        passwordHash: await bcrypt.hash("CreatorSecret123!", 8),
        role: "STUDENT",
      },
    });
    testUserIds.push(creatorUser.id);

    // Create a DRAFT exam to test access restrictions
    const draftExam = await prisma.exam.create({
      data: {
        title: "Draft Advanced Systems Exam",
        description: "Confidential Draft Assessment",
        durationMinutes: 45,
        totalMarks: 50,
        negativeMarking: 0.25,
        status: "DRAFT",
        creatorId: creatorUser.id,
      },
    });
    testExamIds.push(draftExam.id);

    // Helper to create test candidate
    async function createTestCandidate(suffix, role = "STUDENT") {
      const email = `test_cand_${suffix}_${Date.now()}@athena.internal`;
      const passwordHash = await bcrypt.hash("Password123!", 8);
      const user = await prisma.user.create({
        data: {
          name: `Candidate ${suffix}`,
          email,
          passwordHash,
          role,
        },
      });
      testUserIds.push(user.id);
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      return { user, token };
    }

    // Helper to create an in-progress attempt
    async function createTestAttempt(userId, targetExamId = "cs-401", durationMs = 60 * 60 * 1000) {
      const now = new Date();
      const attempt = await prisma.attempt.create({
        data: {
          userId,
          examId: targetExamId,
          status: "IN_PROGRESS",
          startedAt: now,
          deadlineAt: new Date(now.getTime() + durationMs),
        },
      });
      testAttemptIds.push(attempt.id);
      return attempt;
    }

    // --------------------------------------------------------------------------
    // SECTION 1: Authentication & Token Verification Tests
    // --------------------------------------------------------------------------
    console.log("--- Section 1: Authentication & Token Verification Tests ---");

    await asyncTest("Auth: Protected endpoint rejects request without Authorization header (401)", async () => {
      const res = await request("/exams", "GET", null, null);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.message, "Authentication required");
    });

    await asyncTest("Auth: Protected endpoint rejects empty Bearer token (401)", async () => {
      const url = `${baseUrl}/exams`;
      const rawRes = await fetch(url, {
        headers: { Authorization: "Bearer " },
      });
      assert.strictEqual(rawRes.status, 401);
    });

    await asyncTest("Auth: Protected endpoint rejects malformed/invalid token (401)", async () => {
      const res = await request("/exams", "GET", null, "invalid.jwt.token");
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.message, "Invalid or expired token");
    });

    await asyncTest("Auth: Protected endpoint rejects expired token (401)", async () => {
      const expiredToken = jwt.sign(
        { userId: "expired-user-id", email: "expired@test.com", role: "STUDENT" },
        JWT_SECRET,
        { expiresIn: "-1s" }
      );
      const res = await request("/exams", "GET", null, expiredToken);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.message, "Invalid or expired token");
    });

    await asyncTest("Auth: Unauthenticated user rejected across protected endpoints (401)", async () => {
      const endpoints = [
        ["/exams", "GET"],
        ["/exams/cs-401", "GET"],
        ["/exams/session/active", "GET"],
        ["/exams/session/some-id", "GET"],
        ["/exams/cs-401/timer", "GET"],
        ["/exams/cs-401/answer", "POST"],
        ["/exams/cs-401/incident", "POST"],
        ["/exams/cs-401/incidents", "GET"],
        ["/exams/cs-401/submit", "POST"],
        ["/exams/results/my-results", "GET"],
        ["/exams/results/some-id", "GET"],
        ["/users/me", "GET"],
      ];

      for (const [ep, method] of endpoints) {
        const res = await request(ep, method, method === "POST" ? {} : null, null);
        assert.strictEqual(res.status, 401, `Endpoint ${ep} should reject unauthenticated request with 401`);
      }
    });

    await asyncTest("Auth: Registration flow succeeds and issues valid token", async () => {
      const email = `reg_test_${Date.now()}@athena.internal`;
      const res = await request("/auth/register", "POST", {
        name: "New Student",
        email,
        password: "SecretPassword123!",
      });

      assert.strictEqual(res.status, 201);
      assert(res.data.token, "Must return token");
      assert.strictEqual(res.data.user.email, email.toLowerCase());
      assert.strictEqual(res.data.user.role, "STUDENT");
      testUserIds.push(res.data.user.id);
    });

    await asyncTest("Auth: Registration rejects duplicate email with 409", async () => {
      const { user } = await createTestCandidate("dup_reg");
      const res = await request("/auth/register", "POST", {
        name: "Duplicate Student",
        email: user.email,
        password: "SecretPassword123!",
      });
      assert.strictEqual(res.status, 409);
    });

    await asyncTest("Auth: Login succeeds with correct credentials", async () => {
      const email = `login_test_${Date.now()}@athena.internal`;
      const plainPassword = "SecretPassword123!";
      const user = await prisma.user.create({
        data: {
          name: "Login Student",
          email,
          passwordHash: await bcrypt.hash(plainPassword, 8),
          role: "STUDENT",
        },
      });
      testUserIds.push(user.id);

      const res = await request("/auth/login", "POST", {
        email,
        password: plainPassword,
      });

      assert.strictEqual(res.status, 200);
      assert(res.data.token);
      assert.strictEqual(res.data.user.id, user.id);
    });

    await asyncTest("Auth: Login rejects incorrect password with 401", async () => {
      const { user } = await createTestCandidate("wrong_pw");
      const res = await request("/auth/login", "POST", {
        email: user.email,
        password: "WrongPassword999!",
      });
      assert.strictEqual(res.status, 401);
    });

    await asyncTest("Auth: /api/users/me returns authenticated candidate profile", async () => {
      const { user, token } = await createTestCandidate("profile_check");
      const res = await request("/users/me", "GET", null, token);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.user.id, user.id);
      assert.strictEqual(res.data.user.email, user.email);
    });

    // --------------------------------------------------------------------------
    // SECTION 2: Candidate ID Spoofing & Parameter Integrity Tests
    // --------------------------------------------------------------------------
    console.log("\n--- Section 2: Candidate ID Spoofing & Parameter Integrity Tests ---");

    await asyncTest("Security: Candidate ID supplied in request body spoofing another user is rejected with 403", async () => {
      const { user: victim } = await createTestCandidate("spoof_victim");
      const { user: attacker, token: attackerToken } = await createTestCandidate("spoof_attacker");
      const attempt = await createTestAttempt(attacker.id);

      // Attacker attempts to pass victim's candidateId in POST /answer
      const resAnswer = await request("/exams/cs-401/answer", "POST", {
        attemptId: attempt.id,
        questionId: exam.questions[0].id,
        selectedOption: "0",
        candidateId: victim.id, // spoof attempt
      }, attackerToken);

      assert.strictEqual(resAnswer.status, 403);
      assert.strictEqual(resAnswer.data.code, "FORBIDDEN");

      // Attacker attempts to pass victim's userId in POST /submit
      const resSubmit = await request("/exams/cs-401/submit", "POST", {
        attemptId: attempt.id,
        userId: victim.id, // spoof attempt
      }, attackerToken);

      assert.strictEqual(resSubmit.status, 403);
      assert.strictEqual(resSubmit.data.code, "FORBIDDEN");
    });

    await asyncTest("Security: Candidate ID supplied in query params spoofing another user is rejected with 403", async () => {
      const { user: victim } = await createTestCandidate("query_victim");
      const { user: attacker, token: attackerToken } = await createTestCandidate("query_attacker");

      // Attacker tries GET /exams?candidateId=victimId
      const res1 = await request(`/exams?candidateId=${victim.id}`, "GET", null, attackerToken);
      assert.strictEqual(res1.status, 403);

      // Attacker tries GET /users/me?userId=victimId
      const res2 = await request(`/users/me?userId=${victim.id}`, "GET", null, attackerToken);
      assert.strictEqual(res2.status, 403);
    });

    await asyncTest("Security: Server ignores candidateId in body if matching authenticated user and persists correctly", async () => {
      const { user, token } = await createTestCandidate("self_id");
      const attempt = await createTestAttempt(user.id);

      // User passes their own candidateId
      const res = await request("/exams/cs-401/answer", "POST", {
        attemptId: attempt.id,
        questionId: exam.questions[0].id,
        selectedOption: "0",
        candidateId: user.id,
      }, token);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
    });

    // --------------------------------------------------------------------------
    // SECTION 3: Session Ownership & Parameter Tampering Tests
    // --------------------------------------------------------------------------
    console.log("\n--- Section 3: Session Ownership & Parameter Tampering Tests ---");

    await asyncTest("Authorization: Candidate cannot view another candidate's active session state via GET /session/:attemptId (403)", async () => {
      const { user: userA } = await createTestCandidate("session_owner_a");
      const { token: tokenB } = await createTestCandidate("session_snooper_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request(`/exams/session/${attemptA.id}`, "GET", null, tokenB);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "FORBIDDEN");
    });

    await asyncTest("Authorization: Candidate cannot access another candidate's exam via GET /:id?attemptId=... (403)", async () => {
      const { user: userA } = await createTestCandidate("exam_owner_a");
      const { token: tokenB } = await createTestCandidate("exam_snooper_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request(`/exams/cs-401?attemptId=${attemptA.id}`, "GET", null, tokenB);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "FORBIDDEN");
    });

    await asyncTest("Authorization: Candidate cannot sync timer for another candidate's attempt via GET /:id/timer?attemptId=... (403)", async () => {
      const { user: userA } = await createTestCandidate("timer_owner_a");
      const { token: tokenB } = await createTestCandidate("timer_snooper_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request(`/exams/cs-401/timer?attemptId=${attemptA.id}`, "GET", null, tokenB);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "FORBIDDEN");
    });

    await asyncTest("Authorization: Candidate cannot save answer to another candidate's attempt via POST /:id/answer (403)", async () => {
      const { user: userA } = await createTestCandidate("ans_owner_a");
      const { token: tokenB } = await createTestCandidate("ans_tamperer_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request("/exams/cs-401/answer", "POST", {
        attemptId: attemptA.id,
        questionId: exam.questions[0].id,
        selectedOption: "1",
      }, tokenB);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "FORBIDDEN");
    });

    await asyncTest("Authorization: Candidate cannot log proctoring incident to another candidate's attempt via POST /:id/incident (403)", async () => {
      const { user: userA } = await createTestCandidate("inc_owner_a");
      const { token: tokenB } = await createTestCandidate("inc_tamperer_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request("/exams/cs-401/incident", "POST", {
        attemptId: attemptA.id,
        type: "WINDOW_BLUR",
      }, tokenB);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "FORBIDDEN");
    });

    await asyncTest("Authorization: Candidate cannot retrieve another candidate's incidents via GET /:id/incidents?attemptId=... (403)", async () => {
      const { user: userA } = await createTestCandidate("inc_view_owner_a");
      const { token: tokenB } = await createTestCandidate("inc_view_snooper_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request(`/exams/cs-401/incidents?attemptId=${attemptA.id}`, "GET", null, tokenB);
      assert.strictEqual(res.status, 403);
    });

    await asyncTest("Authorization: Candidate cannot submit another candidate's attempt via POST /:id/submit (403)", async () => {
      const { user: userA } = await createTestCandidate("sub_owner_a");
      const { token: tokenB } = await createTestCandidate("sub_tamperer_b");
      const attemptA = await createTestAttempt(userA.id);

      const res = await request("/exams/cs-401/submit", "POST", {
        attemptId: attemptA.id,
        answers: {},
      }, tokenB);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "FORBIDDEN");
    });

    await asyncTest("Validation: Non-existent attemptId query on GET /:id returns 404", async () => {
      const { token } = await createTestCandidate("non_existent_check");
      const res = await request("/exams/cs-401?attemptId=non-existent-attempt-id", "GET", null, token);
      assert.strictEqual(res.status, 404);
    });

    await asyncTest("Validation: Non-existent attemptId query on GET /:id/timer returns 404", async () => {
      const { token } = await createTestCandidate("timer_non_existent");
      const res = await request("/exams/cs-401/timer?attemptId=non-existent-attempt-id", "GET", null, token);
      assert.strictEqual(res.status, 404);
    });

    await asyncTest("Validation: AttemptId belonging to different exam is rejected with 400", async () => {
      const { user, token } = await createTestCandidate("cross_exam_user");
      // Create second exam
      const otherExam = await prisma.exam.create({
        data: {
          title: "Other Exam",
          durationMinutes: 30,
          totalMarks: 20,
          status: "PUBLISHED",
          creatorId: creatorUser.id,
        },
      });
      testExamIds.push(otherExam.id);

      // Attempt for otherExam
      const otherAttempt = await createTestAttempt(user.id, otherExam.id);

      // Try to submit with examId cs-401 but attemptId from otherExam
      const res = await request("/exams/cs-401/submit", "POST", {
        attemptId: otherAttempt.id,
        answers: {},
      }, token);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, "INVALID_EXAM_SESSION");
    });

    // --------------------------------------------------------------------------
    // SECTION 4: Exam Publication Access Restrictions Tests
    // --------------------------------------------------------------------------
    console.log("\n--- Section 4: Exam Publication Access Restrictions Tests ---");

    await asyncTest("Roles: Student cannot access unpublished/DRAFT exam via GET /api/exams/:id (403)", async () => {
      const { token: studentToken } = await createTestCandidate("student_draft_block");
      const res = await request(`/exams/${draftExam.id}`, "GET", null, studentToken);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.code, "EXAM_NOT_AVAILABLE");
    });

    await asyncTest("Roles: Student does not see DRAFT exams in GET /api/exams listing", async () => {
      const { token: studentToken } = await createTestCandidate("student_list_check");
      const res = await request("/exams", "GET", null, studentToken);
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.data.exams));
      const foundDraft = res.data.exams.find((e) => e.id === draftExam.id);
      assert.strictEqual(foundDraft, undefined, "Draft exam must NOT appear in exam list");
    });

    // --------------------------------------------------------------------------
    // SECTION 5: Exam Integrity & Single-Attempt Enforcement Tests
    // --------------------------------------------------------------------------
    console.log("\n--- Section 5: Exam Integrity & Single-Attempt Enforcement Tests ---");

    await asyncTest("Integrity: Single-attempt rule prevents starting new attempt after submission (403)", async () => {
      const { user, token } = await createTestCandidate("single_attempt");
      const attempt = await createTestAttempt(user.id);

      // Submit attempt
      const subRes = await request("/exams/cs-401/submit", "POST", {
        attemptId: attempt.id,
        answers: {},
      }, token);
      assert.strictEqual(subRes.status, 200);

      // Attempt to start/resume exam via GET /:id
      const retryRes = await request("/exams/cs-401", "GET", null, token);
      assert.strictEqual(retryRes.status, 403);
      assert.strictEqual(retryRes.data.code, "ALREADY_SUBMITTED");
    });

    await asyncTest("Integrity: Answer modification rejected on submitted attempt (403 ALREADY_SUBMITTED)", async () => {
      const { user, token } = await createTestCandidate("mod_after_sub");
      const attempt = await createTestAttempt(user.id);

      await request("/exams/cs-401/submit", "POST", {
        attemptId: attempt.id,
        answers: {},
      }, token);

      // Attempt to modify answer
      const ansRes = await request("/exams/cs-401/answer", "POST", {
        attemptId: attempt.id,
        questionId: exam.questions[0].id,
        selectedOption: "0",
      }, token);

      assert.strictEqual(ansRes.status, 403);
      assert.strictEqual(ansRes.data.code, "ALREADY_SUBMITTED");
    });

    await asyncTest("Integrity: Answer modification rejected on expired attempt (403 EXAM_TIMEOUT)", async () => {
      const { user, token } = await createTestCandidate("mod_after_exp");
      // Create attempt that is already past its deadline
      const attempt = await createTestAttempt(user.id, "cs-401", -10 * 1000); // 10s in past

      const ansRes = await request("/exams/cs-401/answer", "POST", {
        attemptId: attempt.id,
        questionId: exam.questions[0].id,
        selectedOption: "0",
      }, token);

      assert.strictEqual(ansRes.status, 403);
      assert.strictEqual(ansRes.data.code, "EXAM_TIMEOUT");
    });

    await asyncTest("Integrity: Client cannot override server scores, total marks, or pass status in submission", async () => {
      const { user, token } = await createTestCandidate("score_tamper");
      const attempt = await createTestAttempt(user.id);

      // Client attempts to inject 100 score with fake counts
      const res = await request("/exams/cs-401/submit", "POST", {
        attemptId: attempt.id,
        score: 100,
        totalMarks: 500,
        correctCount: 99,
        wrongCount: 0,
        passed: true,
        answers: {
          [exam.questions[0].id]: "999", // wrong answer
        },
      }, token);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.result.score, 0, "Score must be calculated authoritatively by server");
      assert.strictEqual(res.data.result.totalMarks, 100, "totalMarks must match exam specification");
      assert.strictEqual(res.data.result.correctCount, 0, "correctCount must reflect true answers");
      assert.strictEqual(res.data.result.passed, false, "passed status must be server calculated");
    });

    await asyncTest("Integrity: Proctoring incident logging rejected on submitted session (403 ALREADY_SUBMITTED)", async () => {
      const { user, token } = await createTestCandidate("inc_after_sub");
      const attempt = await createTestAttempt(user.id);

      await request("/exams/cs-401/submit", "POST", {
        attemptId: attempt.id,
        answers: {},
      }, token);

      const incRes = await request("/exams/cs-401/incident", "POST", {
        attemptId: attempt.id,
        type: "FULLSCREEN_EXIT",
      }, token);

      assert.strictEqual(incRes.status, 403);
      assert.strictEqual(incRes.data.code, "ALREADY_SUBMITTED");
    });

    await asyncTest("Integrity: Proctoring incident logging rejected on expired session (403 EXAM_TIMEOUT)", async () => {
      const { user, token } = await createTestCandidate("inc_after_exp");
      const attempt = await createTestAttempt(user.id, "cs-401", -10 * 1000);

      const incRes = await request("/exams/cs-401/incident", "POST", {
        attemptId: attempt.id,
        type: "WINDOW_BLUR",
      }, token);

      assert.strictEqual(incRes.status, 403);
      assert.strictEqual(incRes.data.code, "EXAM_TIMEOUT");
    });

  } finally {
    server.close();

    // Clean up test records
    await prisma.proctoringIncident.deleteMany({
      where: {
        OR: [
          { attemptId: { in: testAttemptIds } },
          { attempt: { examId: { in: testExamIds } } },
          { attempt: { userId: { in: testUserIds } } },
        ],
      },
    });
    await prisma.result.deleteMany({
      where: {
        OR: [
          { attemptId: { in: testAttemptIds } },
          { attempt: { examId: { in: testExamIds } } },
          { attempt: { userId: { in: testUserIds } } },
        ],
      },
    });
    await prisma.attemptAnswer.deleteMany({
      where: {
        OR: [
          { attemptId: { in: testAttemptIds } },
          { attempt: { examId: { in: testExamIds } } },
          { attempt: { userId: { in: testUserIds } } },
        ],
      },
    });
    await prisma.attempt.deleteMany({
      where: {
        OR: [
          { id: { in: testAttemptIds } },
          { examId: { in: testExamIds } },
          { userId: { in: testUserIds } },
        ],
      },
    });
    if (testExamIds.length > 0) {
      await prisma.question.deleteMany({ where: { examId: { in: testExamIds } } });
      await prisma.exam.deleteMany({ where: { id: { in: testExamIds } } });
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
