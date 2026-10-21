require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

// Whitelist allowed origins: Electron desktop (file:// or null origin), local Vite frontend, and configurable environment origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  // Allow requests with no origin (e.g. Electron file:// protocol, curl, mobile native apps, server-to-server)
  if (!origin || origin === "null" || origin === "file://") {
    return true;
  }

  // Allow localhost / loopback addresses on any port for local development & Electron
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin);
  if (isLocalhost) {
    return true;
  }

  // Allow explicitly configured origins (e.g. production domains or institutional portals)
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return false;
};

// CORS configuration restricting access to authorized origins
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy does not allow access from the specified Origin."));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/user"));
app.use("/api/exams", require("./routes/exams"));
app.use("/api/exam", require("./routes/exams"));

// Lightweight Health Check (Priority 3)
const prisma = require("./prisma");

app.get("/api/health", async (req, res) => {
  let dbStatus = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbStatus = "disconnected";
  }

  res.json({
    status: "ok",
    api: "online",
    database: dbStatus,
    service: "Athena Examination System Backend",
    port: process.env.PORT || 5050,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.send("Athena Examination API is running");
});

// Global error handler for CORS and general server errors
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      message: "Access forbidden: origin not allowed by CORS policy",
      code: "CORS_FORBIDDEN",
    });
  }
  console.error("Unhandled server error:", err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5050;

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Athena API running on http://localhost:${PORT}`);
  });
}

module.exports = app;