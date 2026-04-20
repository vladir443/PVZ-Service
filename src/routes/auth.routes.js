import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  bindEmployeeTelegramId,
  createUser,
  getEmployeeByAuth,
  getUserByTelegramId,
  isCoreAdminUsername,
  syncEmployeeTelegramProfile,
  updateUserProfile,
  updateUserRole
} from "../db.js";
import { getAdminTelegramIds, Role } from "../lib/roles.js";

const router = express.Router();

const loginSchema = z.object({
  telegramId: z.string().min(1).max(64),
  fullName: z.string().min(1).max(120),
  username: z.string().max(64).optional().default(""),
  photoUrl: z.string().max(500).optional().default("")
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

    const { telegramId, fullName, username, photoUrl } = parsed.data;

    const employee = getEmployeeByAuth({ telegramId, username });
    if (!employee) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Доступ закрыт: вас нет в базе сотрудников"
      });
    }

    bindEmployeeTelegramId({ telegramId, username });
    syncEmployeeTelegramProfile({ telegramId, username, photoUrl });

    const adminIds = getAdminTelegramIds();
    const isSuperAdmin = isCoreAdminUsername(username);
    const shouldBeAdmin =
      isSuperAdmin || adminIds.has(telegramId) || employee.accessRole === Role.ADMIN;

    const existingUser = getUserByTelegramId(telegramId);

    let user;
    if (!existingUser) {
      user = createUser({
        telegramId,
        fullName,
        role: shouldBeAdmin ? Role.ADMIN : Role.PARTICIPANT,
        isSuperAdmin
      });
    } else {
      user = updateUserProfile({ telegramId, fullName });

      const targetRole = shouldBeAdmin ? Role.ADMIN : Role.PARTICIPANT;
      const needsRoleUpdate = existingUser.role !== targetRole || (isSuperAdmin && existingUser.role !== Role.SUPERADMIN);
      if (needsRoleUpdate || isSuperAdmin) {
        user = updateUserRole({ telegramId, role: targetRole, isSuperAdmin });
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
