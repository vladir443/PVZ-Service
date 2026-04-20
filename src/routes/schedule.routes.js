import express from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "../lib/roles.js";
import {
  getScheduleForMonth,
  listLocations,
  upsertShift
} from "../db.js";

const router = express.Router();

router.use(requireAuth);

router.get("/locations", (_req, res, next) => {
  try {
    const locations = listLocations();
    return res.json({ locations });
  } catch (error) {
    return next(error);
  }
});

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

router.get("/:locationCode", (req, res, next) => {
  try {
    const parsed = monthSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const schedule = getScheduleForMonth({
      locationCode: req.params.locationCode,
      month: parsed.data.month
    });

    if (!schedule) {
      return res.status(404).json({
        error: "NotFound",
        message: "Location was not found"
      });
    }

    return res.json(schedule);
  } catch (error) {
    return next(error);
  }
});

const shiftSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  executor1: z.string().max(120).default(""),
  executor2: z.string().max(120).default(""),
  rate1: z.coerce.number().min(0).max(1000000).default(0),
  rate2: z.coerce.number().min(0).max(1000000).default(0),
  deductions1: z.coerce.number().min(-1000000).max(0).default(0),
  deductions2: z.coerce.number().min(-1000000).max(0).default(0),
  bonuses1: z.coerce.number().min(0).max(1000000).default(0),
  bonuses2: z.coerce.number().min(0).max(1000000).default(0),
  deductions1Meta: z
    .array(
      z.object({
        reason: z.string().max(120),
        amount: z.coerce.number().min(-1000000).max(0),
        note: z.string().max(250).optional().default("")
      })
    )
    .default([]),
  deductions2Meta: z
    .array(
      z.object({
        reason: z.string().max(120),
        amount: z.coerce.number().min(-1000000).max(0),
        note: z.string().max(250).optional().default("")
      })
    )
    .default([]),
  bonuses1Meta: z
    .array(
      z.object({
        reason: z.string().max(120),
        amount: z.coerce.number().min(0).max(1000000),
        note: z.string().max(250).optional().default("")
      })
    )
    .default([]),
  bonuses2Meta: z
    .array(
      z.object({
        reason: z.string().max(120),
        amount: z.coerce.number().min(0).max(1000000),
        note: z.string().max(250).optional().default("")
      })
    )
    .default([])
});

router.put("/:locationCode/:date", requireRole(Role.ADMIN, Role.SUPERADMIN), (req, res, next) => {
  try {
    const parsed = shiftSchema.safeParse({
      ...req.body,
      date: req.params.date
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const shift = upsertShift({
      locationCode: req.params.locationCode,
      date: parsed.data.date,
      executor1: parsed.data.executor1.trim(),
      executor2: parsed.data.executor2.trim(),
      rate1: parsed.data.rate1,
      rate2: parsed.data.rate2,
      deductions1: parsed.data.deductions1,
      deductions2: parsed.data.deductions2,
      bonuses1: parsed.data.bonuses1,
      bonuses2: parsed.data.bonuses2,
      deductions1Meta: parsed.data.deductions1Meta,
      deductions2Meta: parsed.data.deductions2Meta,
      bonuses1Meta: parsed.data.bonuses1Meta,
      bonuses2Meta: parsed.data.bonuses2Meta
    });

    if (!shift) {
      return res.status(404).json({
        error: "NotFound",
        message: "Location was not found"
      });
    }

    return res.json({ shift });
  } catch (error) {
    return next(error);
  }
});

export default router;
