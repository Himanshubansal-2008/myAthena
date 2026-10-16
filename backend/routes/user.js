const express = require("express");
const prisma = require("../prisma");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        attempts: {
          select: {
            id: true,
            examId: true,
            status: true,
            startedAt: true,
            submittedAt: true,
          },
          take: 5,
          orderBy: { startedAt: "desc" },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({ user });
  } catch (error) {
    console.error("Fetch user error:", error);
    res.status(500).json({
      message: "Unable to fetch user profile",
    });
  }
});

module.exports = router;
