import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createUserSession,
  bindEmployeeTelegramId,
  createUser,
  getPinStateByTelegramId,
  getEmployeeByAuth,
  getUserByTelegramId,
  isCoreAdminUsername,
  logAuditEvent,
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
  photoUrl: z.string().max(2000).optional().default(""),
  deviceName: z.string().max(120).optional().default(""),
  platform: z.string().max(60).optional().default("")
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

    const { telegramId, fullName, username, photoUrl, deviceName, platform } = parsed.data;

    const employee = getEmployeeByAuth({ telegramId, username });
    if (!employee) {
      logAuditEvent({
        scope: "SYSTEM",
        eventType: "AUTH_LOGIN_DENIED",
        actorTelegramId: telegramId,
        actorRole: "",
        targetTelegramId: telegramId,
        sessionId: "",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: { reason: "employee_not_found" },
        systemView: "SUPERADMIN_ONLY"
      });
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

    const session = createUserSession({
      telegramId: user.telegramId,
      deviceName: deviceName || `${req.headers["sec-ch-ua-platform"] || "device"}`,
      platform: platform || "",
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || ""
    });
    const pinState = getPinStateByTelegramId(user.telegramId);
    const pinRequired = !!pinState?.enabled;
    logAuditEvent({
      scope: "PERSONAL",
      eventType: "AUTH_LOGIN_SUCCESS",
      actorUser: user,
      actorTelegramId: user.telegramId,
      actorRole: user.role,
      targetUserId: user.id,
      targetTelegramId: user.telegramId,
      sessionId: session?.session_id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        deviceName: session?.device_name || deviceName || "",
        platform: session?.platform || platform || "",
        pinRequired
      },
      systemView: "TARGET_USER"
    });

    return res.json({
      user,
      session: session
        ? {
            id: session.session_id,
            createdAt: session.created_at,
            lastActiveAt: session.last_active_at,
            pinVerified: session.pin_verified === 1,
            deviceName: session.device_name || "",
            platform: session.platform || ""
          }
        : null,
      security: {
        pinEnabled: !!pinState?.enabled,
        pinRequired,
        pinState
      }
    });
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

    logAuditEvent({
      scope: "PERSONAL",
      eventType: "REMINDER_SETTINGS_UPDATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: req.user.id,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        enabled24,
        enabled14
      },
      systemView: "TARGET_USER"
    });

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

export default router;
