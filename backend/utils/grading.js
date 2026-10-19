/**
 * Athena Examination System - Authoritative Server-Side Grading Utility
 * Responsible for evaluating submitted answers against authoritative question keys
 * and calculating grading summaries (score, totalMarks, correct/wrong/unanswered counts).
 */

/**
 * Checks whether an answer choice is considered answered.
 * Empty strings, null, undefined, or string literal "null"/"undefined" are treated as unanswered.
 */
function isAnswerProvided(choice) {
  if (choice === null || choice === undefined) return false;
  const str = String(choice).trim();
  if (str === "" || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
    return false;
  }
  return true;
}

/**
 * Evaluates a candidate's answer against a question's correct answer.
 * Handles:
 * - Direct equality check (e.g. "0" === "0", or "text" === "text")
 * - Case-insensitive match
 * - Option index matching against options array
 * - Candidate option text matching against options array when correctAnswer is an index
 */
function evaluateAnswer(candidateChoice, question) {
  if (!question) {
    return { isAnswered: false, isCorrect: false };
  }

  if (!isAnswerProvided(candidateChoice)) {
    return { isAnswered: false, isCorrect: false };
  }

  const rawChoice = String(candidateChoice).trim();
  const rawCorrect = String(question.correctAnswer ?? "").trim();

  // 1. Direct equality check (e.g. "0" === "0", or "Option text" === "Option text")
  if (rawChoice === rawCorrect || rawChoice.toLowerCase() === rawCorrect.toLowerCase()) {
    return { isAnswered: true, isCorrect: true };
  }

  // 2. Options array check
  if (Array.isArray(question.options)) {
    // If candidateChoice is an index (0, 1, ...)
    const choiceIdx = Number(rawChoice);
    if (!isNaN(choiceIdx) && choiceIdx >= 0 && choiceIdx < question.options.length) {
      const selectedOptionText = String(question.options[choiceIdx] ?? "").trim();
      if (
        selectedOptionText === rawCorrect ||
        selectedOptionText.toLowerCase() === rawCorrect.toLowerCase()
      ) {
        return { isAnswered: true, isCorrect: true };
      }
    }

    // If question.correctAnswer is an index (0, 1, ...) and candidate submitted option text
    const correctIdx = Number(rawCorrect);
    if (!isNaN(correctIdx) && correctIdx >= 0 && correctIdx < question.options.length) {
      const correctOptionText = String(question.options[correctIdx] ?? "").trim();
      if (
        rawChoice === correctOptionText ||
        rawChoice.toLowerCase() === correctOptionText.toLowerCase()
      ) {
        return { isAnswered: true, isCorrect: true };
      }
    }
  }

  return { isAnswered: true, isCorrect: false };
}

/**
 * Authoritatively calculates grading summary for a set of questions and candidate answers.
 * Respects exam.totalMarks and question.marks, and exam.negativeMarking.
 * Clamps score between 0 and totalMarks.
 *
 * @param {Array} questions - List of Question objects from database
 * @param {Object} answersMap - Map of questionId -> candidate choice
 * @param {Object} exam - Exam object from database
 * @returns {Object} Grading summary
 */
function calculateGrading(questions = [], answersMap = {}, exam = {}) {
  const qList = Array.isArray(questions) ? questions : [];

  let totalMarks = 0;
  if (typeof exam.totalMarks === "number" && exam.totalMarks > 0) {
    totalMarks = exam.totalMarks;
  } else {
    totalMarks =
      qList.reduce((sum, q) => {
        const m = typeof q.marks === "number" && !isNaN(q.marks) && q.marks > 0 ? q.marks : 1;
        return sum + m;
      }, 0) || 100;
  }

  const negativeMarking =
    typeof exam.negativeMarking === "number" &&
    !isNaN(exam.negativeMarking) &&
    exam.negativeMarking > 0
      ? exam.negativeMarking
      : 0;

  let rawScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  qList.forEach((q) => {
    const candidateChoice = answersMap[q.id];
    const { isAnswered, isCorrect } = evaluateAnswer(candidateChoice, q);

    if (!isAnswered) {
      unansweredCount++;
    } else if (isCorrect) {
      correctCount++;
      const qMarks = typeof q.marks === "number" && !isNaN(q.marks) && q.marks > 0 ? q.marks : 1;
      rawScore += qMarks;
    } else {
      wrongCount++;
      rawScore -= negativeMarking;
    }
  });

  const finalScore = Math.min(totalMarks, Math.max(0, Number(rawScore.toFixed(2))));
  const percentage = totalMarks > 0 ? Number(((finalScore / totalMarks) * 100).toFixed(1)) : 0;
  const passed = percentage >= 40.0;

  return {
    score: finalScore,
    totalMarks,
    correctCount,
    wrongCount,
    unansweredCount,
    percentage,
    passed,
  };
}

module.exports = {
  isAnswerProvided,
  evaluateAnswer,
  calculateGrading,
};
