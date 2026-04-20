import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  bindEmployeeTelegramId,
  canLoginByEmployeeAccess,
  createUser,
  getUserByTelegramId,
  isCoreAdminUsername,
  updateUserProfile,
  updateUserRole
} from "../db.js";
import { getAdminTelegramIds, Role } from "../lib/roles.js";

const router = express.Router();

const loginSchema = z.object({
  telegramId: z.string().min(1).max(64),
  fullName: z.string().min(1).max(120),
  username: z.string().max(64).optional().default("")
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const { telegramId, fullName, username } = parsed.data;

    if (!canLoginByEmployeeAccess({ telegramId, username })) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Доступ закрыт: вас нет в базе сотрудников"
      });
    }

    bindEmployeeTelegramId({ telegramId, username });

    const adminIds = getAdminTelegramIds();
    let shouldBeAdmin = adminIds.has(telegramId) || isCoreAdminUsername(username);

    const existingUser = getUserByTelegramId(telegramId);

    let user;
    if (!existingUser) {
      user = createUser({
        telegramId,
        fullName,
        role: shouldBeAdmin ? Role.ADMIN : Role.EMPLOYEE
      });
    } else {
      user = updateUserProfile({ telegramId, fullName });

      if (shouldBeAdmin && existingUser.role !== Role.ADMIN) {
        user = updateUserRole({ telegramId, role: Role.ADMIN });
      }
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
