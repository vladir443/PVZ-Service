import { getActiveSessionWithUser, getPinStateByTelegramId, touchSession } from "../db.js";

async function authBase(req, res, next, { allowUnverifiedPin = false } = {}) {
  try {
    const telegramId = req.header("x-telegram-id")?.trim();
    const sessionId = req.header("x-session-id")?.trim();

    if (!telegramId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "x-telegram-id header is required"
      });
    }

    if (!sessionId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "x-session-id header is required"
      });
    }

    const authPayload = getActiveSessionWithUser({ telegramId, sessionId });
    if (!authPayload?.user || !authPayload?.session) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Сессия не найдена. Выполните вход заново."
      });
    }

    const pinState = getPinStateByTelegramId(telegramId);
    const pinEnabled = !!pinState?.enabled;
    const pinVerified = !!authPayload.session.pinVerified;

    if (!allowUnverifiedPin && pinEnabled && !pinVerified) {
      return res.status(423).json({
        error: "PinRequired",
        message: "Требуется PIN-код",
        pinRequired: true,
        pinState
      });
    }

    touchSession(sessionId);
    req.user = authPayload.user;
    req.session = authPayload.session;
    req.pinState = pinState || null;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function requireAuth(req, res, next) {
  return authBase(req, res, next, { allowUnverifiedPin: false });
}

export async function requireAuthAllowUnverifiedPin(req, res, next) {
  return authBase(req, res, next, { allowUnverifiedPin: true });
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication is required"
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Недостаточно прав"
      });
    }

    return next();
  };
}
