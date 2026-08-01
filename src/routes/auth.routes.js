import express from "express";
import { z } from "zod";
import { requireAuth, requireAuthAllowUnverifiedPin } from "../middleware/auth.js";
import {
  authIdFromPhone,
  createPersonalDataConsent,
  createPhoneLoginCode,
  createUserSession,
  bindEmployeeTelegramId,
  createUser,
  getPinStateByTelegramId,
  getPersonalDataConsent,
  listActiveSessionsByUserId,
  getEmployeeByAuth,
  getUserByTelegramId,
  isCoreAdminUsername,
  logAuditEvent,
  linkPersonalDataConsentToAuthSession,
  revokeSession,
  syncEmployeeTelegramProfile,
  updateUserReminderSettings,
  updateUserProfile,
  updateUserRole,
  verifyPhoneLoginCode
} from "../db.js";
import { getAdminTelegramIds, Role } from "../lib/roles.js";
import {
  PERSONAL_DATA_CONSENT_PATH,
  PERSONAL_DATA_CONSENT_VERSION
} from "../lib/privacy-consent.js";
import { clearAuthCookies, setAuthCookies } from "../lib/auth-cookies.js";
import { sendSmsCode } from "../services/sms.js";

const router = express.Router();

const loginSchema = z.object({
  phone: z.string().min(1).max(40).optional().default(""),
  smsCode: z.string().max(10).optional().default(""),
  telegramId: z.string().max(64).optional().default(""),
  fullName: z.string().max(120).optional().default(""),
  username: z.string().max(64).optional().default(""),
  photoUrl: z.string().max(2000).optional().default(""),
  deviceName: z.string().max(120).optional().default(""),
  platform: z.string().max(60).optional().default(""),
  consentSessionId: z.string().max(128).optional().default("")
});

const requestCodeSchema = z.object({
  phone: z.string().min(1).max(40),
  consentAccepted: z.boolean().optional().default(false),
  consentVersion: z.string().max(80).optional().default(""),
  deviceName: z.string().max(120).optional().default(""),
  platform: z.string().max(60).optional().default("")
});

const smsRequestBuckets = new Map();
const SMS_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const SMS_REQUEST_COOLDOWN_MS = 60 * 1000;

function normalizeRateLimitPart(value) {
  return String(value || "").replace(/[^\dA-Za-z:._-]/g, "").slice(0, 120);
}

function reserveSmsRequest({ phone, ipAddress }) {
  const now = Date.now();
  const phoneKey = `phone:${normalizeRateLimitPart(phone)}`;
  const ipKey = `ip:${normalizeRateLimitPart(ipAddress)}`;
  const checks = [
    { key: phoneKey, max: 5 },
    { key: ipKey, max: 12 }
  ].filter((item) => item.key.split(":")[1]);

  for (const { key, max } of checks) {
    const recent = (smsRequestBuckets.get(key) || []).filter(
      (timestamp) => now - timestamp < SMS_REQUEST_WINDOW_MS
    );
    smsRequestBuckets.set(key, recent);
    const lastRequestAt = recent.at(-1) || 0;
    if (now - lastRequestAt < SMS_REQUEST_COOLDOWN_MS) {
      return { ok: false, retryAfterSeconds: Math.ceil((SMS_REQUEST_COOLDOWN_MS - (now - lastRequestAt)) / 1000) };
    }
    if (recent.length >= max) {
      return { ok: false, retryAfterSeconds: Math.ceil((SMS_REQUEST_WINDOW_MS - (now - recent[0])) / 1000) };
    }
  }

  for (const { key } of checks) {
    smsRequestBuckets.set(key, [...(smsRequestBuckets.get(key) || []), now]);
  }
  if (smsRequestBuckets.size > 2000) {
    for (const [key, timestamps] of smsRequestBuckets) {
      if (!timestamps.some((timestamp) => now - timestamp < SMS_REQUEST_WINDOW_MS)) {
        smsRequestBuckets.delete(key);
      }
    }
  }
  return { ok: true, retryAfterSeconds: 0 };
}

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

    const employee = getEmployeeByAuth({ phone: parsed.data.phone, telegramId: "", username: "" });
    if (!employee) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Доступ закрыт: этот номер не найден в базе сотрудников"
      });
    }

    const smsReservation = reserveSmsRequest({
      phone: parsed.data.phone,
      ipAddress: req.ip || ""
    });
    if (!smsReservation.ok) {
      res.setHeader("Retry-After", String(smsReservation.retryAfterSeconds));
      return res.status(429).json({
        error: "TooManyRequests",
        message: `Новый код можно запросить через ${smsReservation.retryAfterSeconds} сек.`
      });
    }

    const consent = createPersonalDataConsent({
      phone: parsed.data.phone,
      documentVersion: PERSONAL_DATA_CONSENT_VERSION,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      deviceName: parsed.data.deviceName,
      platform: parsed.data.platform
    });
    if (!consent) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Не удалось зафиксировать согласие. Проверьте номер телефона"
      });
    }

    const codeResult = createPhoneLoginCode({ phone: parsed.data.phone });
    if (!codeResult.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Некорректный номер телефона"
      });
    }

    let smsResult;
    try {
      smsResult = await sendSmsCode({
        phone: employee.phone || parsed.data.phone,
        code: codeResult.code,
        ipAddress: req.ip || ""
      });
    } catch (error) {
      console.error("[sms] delivery failed:", error?.message || error);
      return res.status(502).json({
        error: "SmsDeliveryFailed",
        message: "Не удалось отправить SMS. Попробуйте ещё раз через минуту"
      });
    }

    return res.json({
      ok: true,
      expiresAt: codeResult.record?.expiresAt || "",
      devCode: smsResult.devCode || "",
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
      phone,
      smsCode,
      username,
      photoUrl,
      deviceName,
      platform,
      consentSessionId
    } = parsed.data;
    const phoneAuthId = authIdFromPhone(phone);
    const telegramId = phoneAuthId || String(parsed.data.telegramId || "").trim();

    if (!telegramId) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Введите номер телефона"
      });
    }

    if (phoneAuthId) {
      const consent = getPersonalDataConsent({
        phone,
        consentSessionId,
        documentVersion: PERSONAL_DATA_CONSENT_VERSION
      });
      if (!consent) {
        return res.status(400).json({
          error: "ConsentRequired",
          message: "Согласие не найдено. Запросите новый SMS-код",
          consentVersion: PERSONAL_DATA_CONSENT_VERSION,
          consentUrl: PERSONAL_DATA_CONSENT_PATH
        });
      }

      const codeResult = verifyPhoneLoginCode({ phone, code: smsCode });
      if (!codeResult.ok) {
        return res.status(401).json({
          error: "InvalidSmsCode",
          message: codeResult.reason === "expired"
            ? "Код истек. Запросите новый код"
            : "Неверный SMS-код"
        });
      }
    }

    const employee = getEmployeeByAuth({ telegramId, username, phone });
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
        message: "Доступ закрыт: этот номер не найден в базе сотрудников"
      });
    }

    if (!phoneAuthId) {
      bindEmployeeTelegramId({ telegramId, username });
      syncEmployeeTelegramProfile({ telegramId, username, photoUrl });
    }

    const adminIds = getAdminTelegramIds();
    const isProtectedOwner =
      employee.isProtected &&
      (phoneAuthId || String(employee.telegramId || "").trim() === String(telegramId || "").trim());
    const isSuperAdmin = isCoreAdminUsername(username) || isProtectedOwner;
    const shouldBeAdmin =
      isSuperAdmin || adminIds.has(telegramId) || employee.accessRole === Role.ADMIN;

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
    if (phoneAuthId && session?.session_id) {
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
