import express from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getUserByTelegramId,
  logAuditEvent,
  listUsers,
  updateUserRole
} from "../db.js";
import { Role } from "../lib/roles.js";

const router = express.Router();

router.use(requireAuth, requireRole(Role.ADMIN, Role.SUPERADMIN));

router.get("/users", async (_req, res, next) => {
  try {
    const users = listUsers();
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

const updateRoleSchema = z.object({
  role: z.enum([Role.ADMIN, Role.PARTICIPANT])
});

router.patch("/users/:telegramId/role", async (req, res, next) => {
  try {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const targetUser = getUserByTelegramId(req.params.telegramId);
    if (!targetUser) {
      return res.status(404).json({
        error: "NotFound",
        message: "User was not found"
      });
    }

    if (targetUser.role === Role.SUPERADMIN) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Роль главного админа менять нельзя"
      });
    }

    if (req.user.role === Role.ADMIN) {
      if (targetUser.role === Role.ADMIN && parsed.data.role !== Role.ADMIN) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Админ не может менять роль другого админа"
        });
      }
      if (targetUser.role === Role.PARTICIPANT && parsed.data.role !== Role.ADMIN) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Админ может только повысить участника до админа"
        });
      }
    }

    const user = updateUserRole({
      telegramId: req.params.telegramId,
      role: parsed.data.role,
      isSuperAdmin: false
    });

    logAuditEvent({
      scope: "SYSTEM",
      eventType: "USER_ROLE_CHANGED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetUserId: targetUser.id,
      targetTelegramId: targetUser.telegramId,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        fromRole: targetUser.role,
        toRole: parsed.data.role
      },
      systemView: "ALL_ADMINS"
    });

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

export default router;
