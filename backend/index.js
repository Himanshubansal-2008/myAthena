require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

// CORS configuration to allow local Vite frontend and Electron
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. Electron file:// or curl) or localhost origins
      if (!origin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        callback(null, true);
      } else {
        callback(null, true);
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

const PORT = process.env.PORT || 5050;

app.listen(PORT, async () => {
  console.log(`Athena API running on http://localhost:${PORT}`);
});