import express from "express";
import { z } from "zod";
import {
  createEmployee,
  deleteEmployeeById,
  listEmployees,
  updateEmployeeById
} from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

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
  phone: z.string().trim().max(30).optional().default(""),
  telegramContact: z.string().trim().max(120).optional().default(""),
  vkContact: z.string().trim().max(200).optional().default(""),
  position: z.enum(["owner_manager", "senior_manager", "manager", "intern"]),
  reliability: z.enum(["reliable", "checking", "borderline"])
});

function validateContacts(data) {
  if (data.phone && !/^[+0-9()\-\s]{6,30}$/.test(data.phone)) {
    return "Номер телефона должен содержать 6-30 символов: цифры, пробел, +, скобки или тире";
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
      phone: parsed.data.phone,
      telegramContact: parsed.data.telegramContact,
      vkContact: parsed.data.vkContact,
      position: parsed.data.position,
      reliability: parsed.data.reliability
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

    const employee = updateEmployeeById({
      id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      telegramContact: parsed.data.telegramContact,
      vkContact: parsed.data.vkContact,
      position: parsed.data.position,
      reliability: parsed.data.reliability
    });

    if (!employee) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }

    return res.json({ employee });
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

    const deleted = deleteEmployeeById(id);
    if (!deleted) {
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
