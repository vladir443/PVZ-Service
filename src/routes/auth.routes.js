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
  updateUserReminderEnabled,
  updateUserProfile,
  updateUserRole
} from "../db.js";
import { getAdminTelegramIds, Role } from "../lib/roles.js";

const router = express.Router();

const loginSchema = z.object({
  telegramId: z.string().min(1).max(64),
  fullName: z.string().min(1).max(120),
  username: z.string().max(64).optional().default(""),
  photoUrl: z.string().max(2000).optional().default("")
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
    const isProtectedOwner =
      employee.isProtected &&
      String(employee.telegramId || "").trim() === String(telegramId || "").trim();
    const isSuperAdmin = isCoreAdminUsername(username) || isProtectedOwner;
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

const reminderSettingsSchema = z.object({
  enabled: z.coerce.boolean()
});

router.put("/me/reminders", requireAuth, (req, res, next) => {
  try {
    const parsed = reminderSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const user = updateUserReminderEnabled({
      telegramId: req.user.telegramId,
      enabled: parsed.data.enabled
    });

    if (!user) {
      return res.status(404).json({
        error: "NotFound",
        message: "Пользователь не найден"
      });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

export default router;
