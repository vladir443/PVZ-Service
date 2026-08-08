import {
  getActiveSessionWithUser,
  getEmployeeByAuth,
  getPinStateByTelegramId,
  revokeSession,
  touchSession
} from "../db.js";
import { clearAuthCookies, readAuthCookies } from "../lib/auth-cookies.js";

async function authBase(req, res, next, { allowUnverifiedPin = false } = {}) {
  try {
    const cookies = readAuthCookies(req);
    const telegramId = (
      req.header("x-auth-id") ||
      req.header("x-telegram-id") ||
      cookies.authId ||
      ""
    ).trim();
    const sessionId = (
      req.header("x-session-id") ||
      cookies.sessionId ||
      ""
    ).trim();

    if (!telegramId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "x-auth-id header is required"
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
      clearAuthCookies(req, res);
      return res.status(401).json({
        error: "Unauthorized",
        message: "Сессия не найдена. Выполните вход заново."
      });
    }

    const phone = telegramId.startsWith("phone:")
      ? telegramId.slice("phone:".length)
      : "";
    const email = telegramId.startsWith("email:")
      ? telegramId.slice("email:".length)
      : "";
    const employee = getEmployeeByAuth({
      email,
      phone,
      telegramId: phone || email ? "" : telegramId,
      username: ""
    });
    if (!employee) {
      revokeSession({
        userId: authPayload.session.userId,
        sessionId: authPayload.session.id
      });
      clearAuthCookies(req, res);
      return res.status(403).json({
        error: "Forbidden",
        message: "Доступ закрыт: пользователь не найден в базе сотрудников"
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
    req.user = {
      ...authPayload.user,
      position: employee.position || ""
    };
    req.employee = employee;
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

export function requirePosition(...allowedPositions) {
  return (req, res, next) => {
    if (!req.user || !req.employee) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication is required"
      });
    }

    if (!allowedPositions.includes(String(req.employee.position || ""))) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Финансы доступны только владельцу и управляющему"
      });
    }

    return next();
  };
}
