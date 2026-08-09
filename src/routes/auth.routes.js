import express from "express";
import { z } from "zod";
import { requireAuth, requireAuthAllowUnverifiedPin } from "../middleware/auth.js";
import {
  authIdFromEmail,
  createEmailLoginCode,
  createPersonalDataConsent,
  createUserSession,
  createUser,
  getPinStateByTelegramId,
  getPersonalDataConsent,
  listActiveSessionsByUserId,
  getEmployeeByAuth,
  getUserByTelegramId,
  logAuditEvent,
  linkPersonalDataConsentToAuthSession,
  migratePhoneUserToEmail,
  reserveEmailCodeRequest,
  revokeSession,
  updateUserReminderSettings,
  updateEmployeeAvatarById,
  updateUserProfile,
  updateUserRole,
  verifyEmailLoginCode
} from "../db.js";
import { getAdminTelegramIds, Role } from "../lib/roles.js";
import {
  PERSONAL_DATA_CONSENT_PATH,
  PERSONAL_DATA_CONSENT_VERSION
} from "../lib/privacy-consent.js";
import { clearAuthCookies, setAuthCookies } from "../lib/auth-cookies.js";
import { sendEmailCode } from "../services/email.js";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email().max(254),
  emailCode: z.string().regex(/^\d{6}$/),
  fullName: z.string().max(120).optional().default(""),
  deviceName: z.string().max(120).optional().default(""),
  platform: z.string().max(60).optional().default(""),
  consentSessionId: z.string().max(128).optional().default("")
});

const requestCodeSchema = z.object({
  email: z.string().email().max(254),
  consentAccepted: z.boolean().optional().default(false),
  consentVersion: z.string().max(80).optional().default(""),
  deviceName: z.string().max(120).optional().default(""),
  platform: z.string().max(60).optional().default("")
});

router.post("/request-code", async (req, res, next) => {
  try {
    const parsed = requestCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    if (
      !parsed.data.consentAccepted ||
      parsed.data.consentVersion !== PERSONAL_DATA_CONSENT_VERSION
    ) {
      return res.status(400).json({
        error: "ConsentRequired",
        message: "Подтвердите согласие на обработку персональных данных",
        consentVersion: PERSONAL_DATA_CONSENT_VERSION,
        consentUrl: PERSONAL_DATA_CONSENT_PATH
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const employee = getEmployeeByAuth({ email, telegramId: "", username: "" });
    if (!employee) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Доступ закрыт: эта почта не найдена в базе сотрудников"
      });
    }

    const codeReservation = reserveEmailCodeRequest({
      email,
      ipAddress: req.ip || ""
    });
    if (!codeReservation.ok) {
      res.setHeader("Retry-After", String(codeReservation.retryAfterSeconds));
      return res.status(429).json({
        error: "TooManyRequests",
        message: `Новый код можно запросить через ${codeReservation.retryAfterSeconds} сек.`
      });
    }

    const consent = createPersonalDataConsent({
      email,
      documentVersion: PERSONAL_DATA_CONSENT_VERSION,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      deviceName: parsed.data.deviceName,
      platform: parsed.data.platform
    });
    if (!consent) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Не удалось зафиксировать согласие. Проверьте адрес электронной почты"
      });
    }

    const codeResult = createEmailLoginCode({ email });
    if (!codeResult.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Некорректный адрес электронной почты"
      });
    }

    let deliveryResult;
    try {
      deliveryResult = await sendEmailCode({ email: employee.email || email, code: codeResult.code });
    } catch (error) {
      console.error("[email] delivery failed:", error?.message || error);
      return res.status(502).json({
        error: "EmailDeliveryFailed",
        message: "Не удалось отправить письмо. Проверьте настройки почты или попробуйте через минуту"
      });
    }

    return res.json({
      ok: true,
      expiresAt: codeResult.record?.expiresAt || "",
      devCode: deliveryResult.devCode || "",
      consentSessionId: consent.consentSessionId,
      consentVersion: consent.documentVersion
    });
  } catch (error) {
    return next(error);
  }
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

    const {
      email,
      emailCode,
      deviceName,
      platform,
      consentSessionId
    } = parsed.data;
    const emailAuthId = authIdFromEmail(email);
    const telegramId = emailAuthId;

    if (!telegramId) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Введите адрес электронной почты"
      });
    }

    const consent = getPersonalDataConsent({
      email,
      consentSessionId,
      documentVersion: PERSONAL_DATA_CONSENT_VERSION
    });
    if (!consent) {
      return res.status(400).json({
        error: "ConsentRequired",
        message: "Согласие не найдено. Запросите новый код на почту",
        consentVersion: PERSONAL_DATA_CONSENT_VERSION,
        consentUrl: PERSONAL_DATA_CONSENT_PATH
      });
    }

    const codeResult = verifyEmailLoginCode({ email, code: emailCode });
    if (!codeResult.ok) {
      return res.status(401).json({
        error: "InvalidEmailCode",
        message: codeResult.reason === "expired"
          ? "Код истек. Запросите новый код"
          : "Неверный код из письма"
      });
    }

    const employee = getEmployeeByAuth({ telegramId: "", username: "", email });
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
        message: "Доступ закрыт: эта почта не найдена в базе сотрудников"
      });
    }

    const adminIds = getAdminTelegramIds();
    const isProtectedOwner =
      employee.isProtected &&
      String(employee.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase();
    const isSuperAdmin = isProtectedOwner;
    const shouldBeAdmin =
      isSuperAdmin || adminIds.has(telegramId) || employee.accessRole === Role.ADMIN;

    migratePhoneUserToEmail({ phone: employee.phone, email: employee.email || email });
    const existingUser = getUserByTelegramId(telegramId);
    const fullName = String(parsed.data.fullName || "").trim() || employee.fullName;

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

    const priorSessions = listActiveSessionsByUserId({ userId: user.id });
    const nextDeviceName = deviceName || `${req.headers["sec-ch-ua-platform"] || "device"}`;
    const nextPlatform = platform || "";
    const normalizeDevicePart = (value) => String(value || "").trim().toLowerCase();
    const isNewDevice = !priorSessions.some((item) => (
      normalizeDevicePart(item.deviceName) === normalizeDevicePart(nextDeviceName)
      && normalizeDevicePart(item.platform) === normalizeDevicePart(nextPlatform)
    ));

    const session = createUserSession({
      telegramId: user.telegramId,
      deviceName: nextDeviceName,
      platform: nextPlatform,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || ""
    });
    if (emailAuthId && session?.session_id) {
      linkPersonalDataConsentToAuthSession({
        consentSessionId,
        authSessionId: session.session_id
      });
    }
    const pinState = getPinStateByTelegramId(user.telegramId);
    const pinRequired = !!pinState?.enabled;
    if (isNewDevice) {
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
          pinRequired,
          isNewDevice: true
        },
        systemView: "TARGET_USER"
      });
    }

    if (session?.session_id) {
      setAuthCookies(req, res, {
        authId: user.telegramId,
        sessionId: session.session_id
      });
    }

    return res.json({
      user: {
        ...user,
        position: employee.position || ""
      },
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

router.get("/session", requireAuthAllowUnverifiedPin, (req, res) => {
  const pinState = getPinStateByTelegramId(req.user.telegramId);
  return res.json({
    user: req.user,
    session: {
      id: req.session?.id || "",
      createdAt: req.session?.createdAt || "",
      lastActiveAt: req.session?.lastActiveAt || "",
      pinVerified: !!req.session?.pinVerified,
      deviceName: req.session?.deviceName || "",
      platform: req.session?.platform || ""
    },
    security: {
      pinEnabled: !!pinState?.enabled,
      pinRequired: !!pinState?.enabled && !req.session?.pinVerified,
      pinState
    }
  });
});

router.post("/logout", requireAuthAllowUnverifiedPin, (req, res) => {
  revokeSession({
    userId: req.session?.userId,
    sessionId: req.session?.id
  });
  clearAuthCookies(req, res);
  return res.json({ ok: true });
});

const avatarSettingsSchema = z.object({
  emoji: z.enum(["📦", "🏪", "⭐", "🚀", "😎", "🐻", "🦊", "🐼", "💼", "👑", "☕", "⚡"]),
  background: z.enum(["ocean", "sunset", "forest", "violet", "graphite", "gold", "ice", "berry"])
});

router.put("/me/avatar", requireAuth, (req, res, next) => {
  try {
    const parsed = avatarSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Выберите доступный фон и эмодзи"
      });
    }

    const avatarUrl = `pvz-avatar:${JSON.stringify(parsed.data)}`;
    const employee = updateEmployeeAvatarById({
      id: req.employee?.id,
      avatarUrl
    });
    if (!employee) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }

    logAuditEvent({
      scope: "PERSONAL",
      eventType: "PROFILE_AVATAR_UPDATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: parsed.data,
      systemView: "SUPERADMIN_ONLY"
    });

    return res.json({ employee });
  } catch (error) {
    return next(error);
  }
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
