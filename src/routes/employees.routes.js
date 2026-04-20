import express from "express";
import { z } from "zod";
import {
  createEmployee,
  deleteEmployeeById,
  getUserByTelegramId,
  listEmployees,
  updateUserRole,
  updateEmployeeById
} from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "../lib/roles.js";

const router = express.Router();

router.use(requireAuth, requireRole(Role.ADMIN, Role.SUPERADMIN));

router.get("/", (_req, res, next) => {
  try {
    const employees = listEmployees();
    return res.json({ employees });
  } catch (error) {
    return next(error);
  }
});

const contactSchema = z.object({
  firstName: z.string().trim().min(3).max(60),
  lastName: z.string().trim().min(3).max(60),
  telegramId: z.string().trim().max(64).optional().default(""),
  avatarUrl: z.string().trim().max(500).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  telegramContact: z.string().trim().max(120).optional().default(""),
  vkContact: z.string().trim().max(200).optional().default(""),
  position: z.enum(["owner", "owner_manager", "senior_manager", "manager", "intern"]),
  reliability: z.enum(["reliable", "checking", "borderline"]),
  accessRole: z.enum([Role.ADMIN, Role.PARTICIPANT]).optional().default(Role.PARTICIPANT)
});

function validateContacts(data) {
  if (data.phone) {
    const digits = String(data.phone).replace(/\D/g, "");
    if (digits.length !== 11 || digits[0] !== "7") {
      return "Телефон должен быть в формате +7 999 999-99-99 (11 цифр, начиная с 7)";
    }
  }

  if (data.telegramContact && !/^@?[a-zA-Z0-9_]{5,}$/.test(data.telegramContact)) {
    return "Telegram контакт укажи как username: @username";
  }

  if (data.vkContact && !/^https?:\/\/(vk\.com|m\.vk\.com)\/[A-Za-z0-9_.-]+$/i.test(data.vkContact)) {
    return "VK контакт укажи ссылкой вида https://vk.com/username";
  }

  return null;
}

router.post("/", (req, res, next) => {
  try {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    if (req.user.role === Role.ADMIN && parsed.data.accessRole !== Role.PARTICIPANT) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Админ не может менять роли"
      });
    }

    const validationMessage = validateContacts(parsed.data);
    if (validationMessage) {
      return res.status(400).json({
        error: "ValidationError",
        message: validationMessage
      });
    }

    const employee = createEmployee({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      telegramId: parsed.data.telegramId,
      avatarUrl: parsed.data.avatarUrl,
      phone: parsed.data.phone,
      telegramContact: parsed.data.telegramContact,
      vkContact: parsed.data.vkContact,
      position: parsed.data.position,
      reliability: parsed.data.reliability,
      accessRole: parsed.data.accessRole
    });

    return res.status(201).json({ employee });
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) {
      return res.status(409).json({
        error: "Conflict",
        message: "Сотрудник с таким именем уже существует"
      });
    }
    return next(error);
  }
});

router.put("/:id", (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Некорректный id сотрудника"
      });
    }

    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const validationMessage = validateContacts(parsed.data);
    if (validationMessage) {
      return res.status(400).json({
        error: "ValidationError",
        message: validationMessage
      });
    }

    const currentEmployees = listEmployees();
    const targetEmployee = currentEmployees.find((item) => item.id === id);
    if (!targetEmployee) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }

    const actorRole = req.user.role;
    const targetRole = targetEmployee.accessRole || Role.PARTICIPANT;
    const requestedRole = parsed.data.accessRole || Role.PARTICIPANT;
    const isSelf = String(targetEmployee.telegramId || "").trim() === String(req.user.telegramId || "").trim();

    if (actorRole === Role.ADMIN) {
      if (targetRole !== Role.PARTICIPANT) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Админ может изменять данные только у участников"
        });
      }
      if (requestedRole !== targetRole) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Админ не может менять роли"
        });
      }
    }

    if (targetEmployee.isProtected && !(actorRole === Role.SUPERADMIN && isSelf)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Данные главного админа может менять только он сам"
      });
    }

    const result = updateEmployeeById({
      id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      telegramId: parsed.data.telegramId,
      avatarUrl: parsed.data.avatarUrl || targetEmployee.avatarUrl || "",
      phone: parsed.data.phone,
      telegramContact: parsed.data.telegramContact,
      vkContact: parsed.data.vkContact,
      position: parsed.data.position,
      reliability: parsed.data.reliability,
      accessRole: requestedRole
    });

    if (result.reason === "protected") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Этого сотрудника нельзя редактировать"
      });
    }

    if (!result.employee) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }

    if (result.employee.telegramId) {
      const targetUser = getUserByTelegramId(result.employee.telegramId);
      if (targetUser && targetUser.role !== Role.SUPERADMIN) {
        updateUserRole({
          telegramId: result.employee.telegramId,
          role: requestedRole,
          isSuperAdmin: false
        });
      }
    }

    return res.json({ employee: result.employee });
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) {
      return res.status(409).json({
        error: "Conflict",
        message: "Сотрудник с таким именем уже существует"
      });
    }
    return next(error);
  }
});

router.delete("/:id", (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Некорректный id сотрудника"
      });
    }

    const currentEmployees = listEmployees();
    const targetEmployee = currentEmployees.find((item) => item.id === id);
    if (!targetEmployee) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }
    const actorRole = req.user.role;
    const targetRole = targetEmployee.accessRole || Role.PARTICIPANT;
    const isSelf = String(targetEmployee.telegramId || "").trim() === String(req.user.telegramId || "").trim();

    if (isSelf) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Нельзя удалить самого себя из базы сотрудников"
      });
    }

    if (actorRole === Role.ADMIN && targetRole !== Role.PARTICIPANT) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Админ может удалять только участников"
      });
    }

    if (targetEmployee.isProtected) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Главного админа удалить нельзя"
      });
    }

    const deleted = deleteEmployeeById(id);
    if (deleted.reason === "protected") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Этого сотрудника нельзя удалить"
      });
    }

    if (!deleted.deleted) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
