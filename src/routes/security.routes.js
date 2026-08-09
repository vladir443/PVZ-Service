import express from "express";
import { z } from "zod";
import {
  changePinForUser,
  completePinRecovery,
  createEmailLoginCode,
  createPinRecoveryToken,
  disablePinForUser,
  enablePinForUser,
  getPinPolicy,
  getPinStateByTelegramId,
  listActiveSessionsByUserId,
  listAuditLogsForViewer,
  logAuditEvent,
  reserveEmailCodeRequest,
  resetPinForTelegramId,
  revokeOtherSessions,
  revokeSession,
  setSessionPinVerified,
  verifyEmailLoginCode,
  verifyPinForUser
} from "../db.js";
import { requireAuthAllowUnverifiedPin, requireRole } from "../middleware/auth.js";
import { Role } from "../lib/roles.js";
import { sendEmailCode } from "../services/email.js";

const router = express.Router();
router.use(requireAuthAllowUnverifiedPin);

function requirePinVerified(req, res, next) {
  if (req.pinState?.enabled && !req.session?.pinVerified) {
    return res.status(423).json({
      error: "PinRequired",
      message: "Требуется PIN-код",
      pinRequired: true,
      pinState: req.pinState
    });
  }
  return next();
}

const pinOnlySchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/)
});

const pinChangeSchema = z.object({
  currentPin: z.string().trim().regex(/^\d{4}$/),
  newPin: z.string().trim().regex(/^\d{4}$/)
});

const pinDisableSchema = z.object({
  currentPin: z.string().trim().regex(/^\d{4}$/)
});

const pinRecoveryCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
});

const pinRecoveryCompleteSchema = z.object({
  recoveryToken: z.string().trim().length(64),
  newPin: z.string().trim().regex(/^\d{4}$/)
});

const logQuerySchema = z.object({
  scope: z.enum(["PERSONAL", "SYSTEM"]).default("PERSONAL"),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

router.get("/state", (req, res) => {
  const pinState = getPinStateByTelegramId(req.user.telegramId);
  return res.json({
    pinState,
    pinPolicy: getPinPolicy(),
    session: {
      id: req.session?.id || "",
      pinVerified: !!req.session?.pinVerified,
      createdAt: req.session?.createdAt || "",
      lastActiveAt: req.session?.lastActiveAt || ""
    }
  });
});

router.post("/pin/verify", (req, res, next) => {
  try {
    const parsed = pinOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const result = verifyPinForUser({
      telegramId: req.user.telegramId,
      pin: parsed.data.pin
    });

    if (!result.ok) {
      logAuditEvent({
        scope: "PERSONAL",
        eventType: result.reason === "locked" ? "PIN_VERIFY_LOCKED" : "PIN_VERIFY_FAILED",
        actorUser: req.user,
        actorTelegramId: req.user.telegramId,
        actorRole: req.user.role,
        targetUserId: req.user.id,
        targetTelegramId: req.user.telegramId,
        sessionId: req.session?.id || "",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: {
          reason: result.reason,
          pinState: result.state || null
        },
        systemView: "TARGET_USER"
      });
      const isLocked = result.reason === "locked";
      return res.status(isLocked ? 423 : 401).json({
        error: isLocked ? "PinLocked" : "InvalidPin",
        message: isLocked ? "PIN временно заблокирован" : "Неверный PIN",
        pinState: result.state || null
      });
    }

    setSessionPinVerified({ sessionId: req.session.id, verified: true });
    return res.json({ ok: true, pinState: result.state || getPinStateByTelegramId(req.user.telegramId) });
  } catch (error) {
    return next(error);
  }
});

router.post("/pin/enable", requirePinVerified, (req, res, next) => {
  try {
    const parsed = pinOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }
    const result = enablePinForUser({
      telegramId: req.user.telegramId,
      pin: parsed.data.pin
    });
    if (!result.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message: "PIN должен состоять ровно из 4 цифр"
      });
    }
    logAuditEvent({
      scope: "PERSONAL",
      eventType: "PIN_ENABLED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: req.user.id,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {},
      systemView: "TARGET_USER"
    });
    return res.json({ ok: true, pinState: result.state });
  } catch (error) {
    return next(error);
  }
});

router.post("/pin/change", requirePinVerified, (req, res, next) => {
  try {
    const parsed = pinChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }
    const result = changePinForUser({
      telegramId: req.user.telegramId,
      currentPin: parsed.data.currentPin,
      newPin: parsed.data.newPin
    });
    if (!result.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message:
          result.reason === "invalid_current_pin"
            ? "Текущий PIN неверный"
            : "Новый PIN должен состоять ровно из 4 цифр"
      });
    }
    logAuditEvent({
      scope: "PERSONAL",
      eventType: "PIN_CHANGED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: req.user.id,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {},
      systemView: "TARGET_USER"
    });
    return res.json({ ok: true, pinState: result.state });
  } catch (error) {
    return next(error);
  }
});

router.post("/pin/disable", requirePinVerified, (req, res, next) => {
  try {
    const parsed = pinDisableSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }
    const result = disablePinForUser({
      telegramId: req.user.telegramId,
      currentPin: parsed.data.currentPin
    });
    if (!result.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Неверный PIN"
      });
    }
    logAuditEvent({
      scope: "PERSONAL",
      eventType: "PIN_DISABLED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: req.user.id,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {},
      systemView: "TARGET_USER"
    });
    return res.json({ ok: true, pinState: result.state });
  } catch (error) {
    return next(error);
  }
});

router.post("/pin/recovery/request", async (req, res, next) => {
  try {
    const email = String(req.employee?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(409).json({
        error: "EmailNotLinked",
        message: "В профиле сотрудника не указана почта для восстановления PIN"
      });
    }
    const reservation = reserveEmailCodeRequest({
      email,
      ipAddress: req.ip || ""
    });
    if (!reservation.ok) {
      res.setHeader("Retry-After", String(reservation.retryAfterSeconds));
      return res.status(429).json({
        error: "TooManyRequests",
        message: `Новый код можно запросить через ${reservation.retryAfterSeconds} сек.`
      });
    }
    const codeResult = createEmailLoginCode({ email, ttlMinutes: 10 });
    if (!codeResult.ok) {
      return res.status(400).json({ error: "ValidationError", message: "Некорректная почта" });
    }
    try {
      await sendEmailCode({ email, code: codeResult.code, purpose: "pin_recovery" });
    } catch (error) {
      console.error("[email] PIN recovery delivery failed:", error?.message || error);
      return res.status(502).json({
        error: "EmailDeliveryFailed",
        message: "Не удалось отправить письмо. Попробуйте через минуту"
      });
    }

    logAuditEvent({
      scope: "SYSTEM",
      eventType: "PIN_RECOVERY_REQUESTED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: req.user.id,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { delivery: "email" },
      systemView: "TARGET_USER"
    });
    return res.json({
      ok: true,
      maskedEmail: email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
      expiresAt: codeResult.record?.expiresAt || "",
      message: "Код восстановления отправлен на почту"
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/pin/recovery/verify-code", (req, res, next) => {
  try {
    const parsed = pinRecoveryCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "ValidationError", message: "Введите 6 цифр из письма" });
    }
    const email = String(req.employee?.email || "").trim().toLowerCase();
    const verification = verifyEmailLoginCode({ email, code: parsed.data.code });
    if (!verification.ok) {
      return res.status(401).json({
        error: "InvalidEmailCode",
        message: verification.reason === "expired"
          ? "Код истёк. Запросите новый код"
          : "Неверный код из письма"
      });
    }
    const recovery = createPinRecoveryToken({
      userId: req.user.id,
      sessionId: req.session.id,
      ttlMinutes: 10
    });
    if (!recovery.ok) throw new Error("Не удалось подтвердить восстановление PIN");
    return res.json({ ok: true, recoveryToken: recovery.token, expiresAt: recovery.expiresAt });
  } catch (error) {
    return next(error);
  }
});

router.post("/pin/recovery/complete", (req, res, next) => {
  try {
    const parsed = pinRecoveryCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "ValidationError", message: "PIN должен состоять из 4 цифр" });
    }
    const result = completePinRecovery({
      userId: req.user.id,
      telegramId: req.user.telegramId,
      sessionId: req.session.id,
      token: parsed.data.recoveryToken,
      newPin: parsed.data.newPin
    });
    if (!result.ok) {
      return res.status(401).json({
        error: "InvalidRecoveryToken",
        message: result.reason === "expired"
          ? "Подтверждение истекло. Запросите новый код"
          : "Не удалось подтвердить восстановление PIN"
      });
    }
    logAuditEvent({
      scope: "PERSONAL",
      eventType: "PIN_RECOVERED_EMAIL",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: req.user.id,
      targetTelegramId: req.user.telegramId,
      sessionId: req.session.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { delivery: "email" },
      systemView: "TARGET_USER"
    });
    return res.json({ ok: true, pinState: result.state, message: "Новый PIN сохранён" });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/pin/recovery/reset/:telegramId",
  requirePinVerified,
  requireRole(Role.SUPERADMIN),
  (req, res) => {
    const result = resetPinForTelegramId({ telegramId: req.params.telegramId });
    if (!result.ok) {
      return res.status(404).json({
        error: "NotFound",
        message: "Пользователь не найден"
      });
    }
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "PIN_RECOVERY_RESET_BY_SUPERADMIN",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: req.params.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {},
      systemView: "SUPERADMIN_ONLY"
    });
    return res.json({ ok: true });
  }
);

router.get("/sessions", requirePinVerified, (req, res) => {
  const sessions = listActiveSessionsByUserId({
    userId: req.user.id,
    currentSessionId: req.session?.id || ""
  });
  return res.json({ sessions });
});

router.delete("/sessions/:sessionId", requirePinVerified, (req, res) => {
  const sessionId = String(req.params.sessionId || "").trim();
  if (!sessionId) {
    return res.status(400).json({
      error: "ValidationError",
      message: "Некорректный session id"
    });
  }
  if (sessionId === req.session?.id) {
    return res.status(400).json({
      error: "ValidationError",
      message: "Нельзя завершить текущую сессию из этого экрана"
    });
  }
  const revoked = revokeSession({
    userId: req.user.id,
    sessionId
  });
  if (!revoked) {
    return res.status(404).json({
      error: "NotFound",
      message: "Сессия не найдена"
    });
  }
  logAuditEvent({
    scope: "PERSONAL",
    eventType: "SESSION_REVOKED",
    actorUser: req.user,
    actorTelegramId: req.user.telegramId,
    actorRole: req.user.role,
    targetUserId: req.user.id,
    targetTelegramId: req.user.telegramId,
    sessionId: req.session?.id || "",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    meta: { revokedSessionId: sessionId },
    systemView: "TARGET_USER"
  });
  return res.status(204).send();
});

router.post("/sessions/revoke-others", requirePinVerified, (req, res) => {
  const count = revokeOtherSessions({
    userId: req.user.id,
    currentSessionId: req.session?.id || ""
  });
  logAuditEvent({
    scope: "PERSONAL",
    eventType: "SESSIONS_REVOKED_OTHERS",
    actorUser: req.user,
    actorTelegramId: req.user.telegramId,
    actorRole: req.user.role,
    targetUserId: req.user.id,
    targetTelegramId: req.user.telegramId,
    sessionId: req.session?.id || "",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    meta: { revokedCount: count },
    systemView: "TARGET_USER"
  });
  return res.json({ revokedCount: count });
});

router.get("/journal", requirePinVerified, (req, res) => {
  const parsed = logQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "ValidationError",
      issues: parsed.error.flatten()
    });
  }
  if (
    parsed.data.scope === "SYSTEM" &&
    req.user.role !== Role.ADMIN &&
    req.user.role !== Role.SUPERADMIN
  ) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Системный журнал доступен только администраторам"
    });
  }
  const logs = listAuditLogsForViewer({
    viewerUser: req.user,
    scope: parsed.data.scope,
    limit: parsed.data.limit
  });
  return res.json({ logs });
});

export default router;
