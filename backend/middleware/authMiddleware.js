const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "iUg+BrFygBiTG0isaq3vHxohHZ8QesXeTLXgE6iUCTw=";

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const token = authorization.split(" ")[1];
  if (!token || token.trim() === "") {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || (!payload.userId && !payload.id)) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    const resolvedUserId = payload.userId || payload.id;
    req.user = {
      ...payload,
      id: resolvedUserId,
      userId: resolvedUserId,
      email: payload.email,
      role: payload.role || "STUDENT",
    };
    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

/**
 * Middleware to enforce candidate identity integrity.
 * Never trusts candidate IDs supplied in req.body or req.query.
 * Rejects requests if candidateId/userId in body/query differs from authenticated candidate.
 * Binds authenticated userId to request.
 */
function enforceCandidateIdentity(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const authenticatedId = req.user.userId;

  // Check candidate ID in body
  const bodyCandidateId = req.body?.candidateId || req.body?.userId || req.body?.studentId;
  if (bodyCandidateId && bodyCandidateId !== authenticatedId) {
    return res.status(403).json({
      message: "Unauthorized: You cannot access or modify records for another candidate.",
      code: "FORBIDDEN",
    });
  }

  // Check candidate ID in query
  const queryCandidateId = req.query?.candidateId || req.query?.userId || req.query?.studentId;
  if (queryCandidateId && queryCandidateId !== authenticatedId) {
    return res.status(403).json({
      message: "Unauthorized: You cannot access or modify records for another candidate.",
      code: "FORBIDDEN",
    });
  }

  // Bind authenticated identity
  if (req.body && typeof req.body === "object") {
    req.body.candidateId = authenticatedId;
    req.body.userId = authenticatedId;
  }

  next();
}

module.exports = { authenticateToken, enforceCandidateIdentity, JWT_SECRET };
