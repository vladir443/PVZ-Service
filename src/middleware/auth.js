import { getUserByTelegramId } from "../db.js";

export async function requireAuth(req, res, next) {
  try {
    const telegramId = req.header("x-telegram-id")?.trim();

    if (!telegramId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "x-telegram-id header is required"
      });
    }

    const user = getUserByTelegramId(telegramId);

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User not found. Call POST /api/auth/login first."
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
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
