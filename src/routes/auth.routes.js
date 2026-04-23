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
  updateUserReminderSettings,
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
  enabled: z.coerce.boolean().optional(),
  enabled24: z.coerce.boolean().optional(),
  enabled14: z.coerce.boolean().optional()
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

    const currentUser = getUserByTelegramId(req.user.telegramId);
    if (!currentUser) {
      return res.status(404).json({
        error: "NotFound",
        message: "Пользователь не найден"
      });
    }

    let enabled24 = currentUser.reminder24Enabled !== false;
    let enabled14 = currentUser.reminder14Enabled !== false;

    if (typeof parsed.data.enabled === "boolean" &&
      typeof parsed.data.enabled24 !== "boolean" &&
      typeof parsed.data.enabled14 !== "boolean") {
      enabled24 = parsed.data.enabled;
      enabled14 = parsed.data.enabled;
    } else {
      if (typeof parsed.data.enabled24 === "boolean") enabled24 = parsed.data.enabled24;
      if (typeof parsed.data.enabled14 === "boolean") enabled14 = parsed.data.enabled14;
    }

    const user = updateUserReminderSettings({
      telegramId: req.user.telegramId,
      enabled24,
      enabled14
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
