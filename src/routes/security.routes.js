import express from "express";
import { z } from "zod";
import {
  changePinForUser,
  disablePinForUser,
  enablePinForUser,
  getPinPolicy,
  getPinStateByTelegramId,
  listActiveSessionsByUserId,
  listAuditLogsForViewer,
  logAuditEvent,
  resetPinForTelegramId,
  revokeOtherSessions,
  revokeSession,
  setSessionPinVerified,
  verifyPinForUser
} from "../db.js";
import { requireAuthAllowUnverifiedPin, requireRole } from "../middleware/auth.js";
import { Role } from "../lib/roles.js";

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
  pin: z.string().trim().min(4).max(8)
});

const pinChangeSchema = z.object({
  currentPin: z.string().trim().min(4).max(8),
  newPin: z.string().trim().min(4).max(8)
});

const pinDisableSchema = z.object({
  currentPin: z.string().trim().min(4).max(8)
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
    logAuditEvent({
      scope: "PERSONAL",
      eventType: "PIN_VERIFY_SUCCESS",
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
        message: "PIN должен быть от 4 до 8 цифр"
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
            : "Новый PIN должен быть от 4 до 8 цифр"
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

router.post("/pin/recovery/request", (req, res) => {
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
    meta: {},
    systemView: "ALL_ADMINS"
  });
  return res.json({
    ok: true,
    message: "Запрос на восстановление отправлен. Обратитесь к главному администратору."
  });
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
  const logs = listAuditLogsForViewer({
    viewerUser: req.user,
    scope: parsed.data.scope,
    limit: parsed.data.limit
  });
  return res.json({ logs });
});

export default router;
