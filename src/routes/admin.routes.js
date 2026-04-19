import express from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  countAdmins,
  getUserByTelegramId,
  listUsers,
  updateUserRole
} from "../db.js";
import { Role } from "../lib/roles.js";

const router = express.Router();

router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/users", async (_req, res, next) => {
  try {
    const users = listUsers();
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

const updateRoleSchema = z.object({
  role: z.enum([Role.ADMIN, Role.EMPLOYEE])
});

router.patch("/users/:telegramId/role", async (req, res, next) => {
  try {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const targetUser = getUserByTelegramId(req.params.telegramId);
    if (!targetUser) {
      return res.status(404).json({
        error: "NotFound",
        message: "User was not found"
      });
    }

    if (
      targetUser.role === Role.ADMIN &&
      parsed.data.role === Role.EMPLOYEE &&
      countAdmins() === 1
    ) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Cannot demote the last admin user"
      });
    }

    const user = updateUserRole({
      telegramId: req.params.telegramId,
      role: parsed.data.role
    });

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

export default router;
