import express from "express";
import { z } from "zod";
import {
  createEmployee,
  deleteEmployeeById,
  listEmployees
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

const createSchema = z.object({
  firstName: z.string().trim().min(3).max(60),
  lastName: z.string().trim().min(3).max(60),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(30)
    .regex(/^[+0-9()\-\s]+$/),
  position: z.enum(["owner_manager", "senior_manager", "manager", "intern"]),
  reliability: z.enum(["reliable", "checking", "borderline"])
});

router.post("/", (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const employee = createEmployee({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
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
