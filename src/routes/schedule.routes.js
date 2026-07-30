import express from "express";
import { z } from "zod";
import { requireAuth, requirePosition, requireRole } from "../middleware/auth.js";
import { Role } from "../lib/roles.js";
import {
  createFinancePayment,
  deleteFinancePayment,
  getEmployeeLocationCodes,
  getUpcomingShiftDatesForTelegramId,
  getTodayAssignmentsForTelegramId,
  getScheduleForMonth,
  listFinancePaymentsForMonth,
  listEmployees,
  listShiftPaymentsForMonth,
  listLocations,
  logAuditEvent,
  markEmployeePeriodPaid,
  markShiftPaid,
  unmarkShiftPaid,
  updateLocationHours,
  validateShiftExecutors,
  upsertShift
} from "../db.js";

const router = express.Router();

router.use(requireAuth);

router.get("/locations", (req, res, next) => {
  try {
    const allowedCodes = new Set(getEmployeeLocationCodes(req.employee.id));
    const locations = listLocations().filter((location) => allowedCodes.has(location.code));
    return res.json({ locations });
  } catch (error) {
    return next(error);
  }
});

function requireEmployeeLocationAccess(req, res, next) {
  const locationCode = String(req.params.locationCode || "").trim();
  const allowedCodes = new Set(getEmployeeLocationCodes(req.employee.id));
  if (!allowedCodes.has(locationCode)) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Этот ПВЗ не назначен сотруднику"
    });
  }
  return next();
}

const locationHoursSchema = z.object({
  workStart: z.string().regex(/^\d{2}:\d{2}$/),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/)
});

router.put("/locations/:code/hours", requireRole(Role.ADMIN, Role.SUPERADMIN), (req, res, next) => {
  try {
    const parsed = locationHoursSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }
    const updated = updateLocationHours({
      code: req.params.code,
      workStart: parsed.data.workStart,
      workEnd: parsed.data.workEnd
    });
    if (!updated) {
      return res.status(404).json({
        error: "NotFound",
        message: "Location was not found"
      });
    }
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "LOCATION_HOURS_UPDATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        locationCode: updated.code,
        locationTitle: updated.title,
        workStart: updated.work_start,
        workEnd: updated.work_end
      },
      systemView: "ALL_ADMINS"
    });
    return res.json({
      location: {
        code: updated.code,
        title: updated.title,
        workStart: updated.work_start,
        workEnd: updated.work_end
      }
    });
  } catch (error) {
    return next(error);
  }
});

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

export function calculateShiftRates({
  dailyRate,
  locationWorkStart,
  locationWorkEnd,
  executor1,
  executor2,
  executor1Start,
  executor1End,
  executor2Start,
  executor2End
}) {
  const locationStartMinutes = timeToMinutes(locationWorkStart);
  const locationEndMinutes = timeToMinutes(locationWorkEnd);
  const locationMinutes = locationEndMinutes - locationStartMinutes;
  if (!Number.isFinite(locationMinutes) || locationMinutes <= 0) {
    return { ok: false, message: "В админ-панели указан некорректный график ПВЗ" };
  }

  const normalizeExecutorTime = (executor, start, end, label) => {
    if (!executor) return { start: "", end: "", minutes: 0 };
    const safeStart = String(start || locationWorkStart);
    const safeEnd = String(end || locationWorkEnd);
    const startMinutes = timeToMinutes(safeStart);
    const endMinutes = timeToMinutes(safeEnd);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      return { error: `Укажите корректное время для ${label}` };
    }
    if (startMinutes < locationStartMinutes || endMinutes > locationEndMinutes) {
      return {
        error: `${label}: время должно быть в пределах работы ПВЗ ${locationWorkStart}–${locationWorkEnd}`
      };
    }
    if (endMinutes <= startMinutes) {
      return { error: `${label}: окончание должно быть позже начала` };
    }
    return { start: safeStart, end: safeEnd, minutes: endMinutes - startMinutes };
  };

  const first = normalizeExecutorTime(
    executor1,
    executor1Start,
    executor1End,
    "Исполнителя1"
  );
  if (first.error) return { ok: false, message: first.error };
  const second = normalizeExecutorTime(
    executor2,
    executor2Start,
    executor2End,
    "Исполнителя2"
  );
  if (second.error) return { ok: false, message: second.error };

  const totalEmployeeMinutes = first.minutes + second.minutes;
  const divisor = Math.max(locationMinutes, totalEmployeeMinutes);
  let rate1 = divisor > 0 ? Math.round((dailyRate * first.minutes) / divisor) : 0;
  let rate2 = divisor > 0 ? Math.round((dailyRate * second.minutes) / divisor) : 0;
  const overflow = rate1 + rate2 - dailyRate;
  if (overflow > 0) {
    if (rate2 > 0) rate2 = Math.max(0, rate2 - overflow);
    else rate1 = Math.max(0, rate1 - overflow);
  }

  return {
    ok: true,
    executor1Start: first.start,
    executor1End: first.end,
    executor2Start: second.start,
    executor2End: second.end,
    executor1Minutes: first.minutes,
    executor2Minutes: second.minutes,
    locationMinutes,
    rate1,
    rate2
  };
}

const todaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const upcomingSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional()
});

function normalizeFinanceEmployeeName(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function employeeFinanceAliases(employee) {
  return new Set(
    [
      employee?.fullName,
      [employee?.firstName, employee?.lastName].filter(Boolean).join(" "),
      [employee?.lastName, employee?.firstName].filter(Boolean).join(" ")
    ]
      .map(normalizeFinanceEmployeeName)
      .filter(Boolean)
  );
}

function normalizeFinanceItems(items, fallbackReason, fallbackAmount) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => ({
      reason: String(item?.reason || fallbackReason).trim() || fallbackReason,
      description: String(item?.note || "").trim(),
      amount: Math.abs(Number(item?.amount || 0))
    }))
    .filter((item) => item.amount > 0);
  if (normalized.length || fallbackAmount <= 0) return normalized;
  return [{ reason: fallbackReason, description: "", amount: fallbackAmount }];
}

router.get("/me/today", (req, res, next) => {
  try {
    const parsed = todaySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const todayIso =
      parsed.data.date ||
      new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10);
    const result = getTodayAssignmentsForTelegramId({
      telegramId: req.user.telegramId,
      date: todayIso
    });

    return res.json({
      date: todayIso,
      employee: result.employee,
      assignments: result.assignments
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me/upcoming", (req, res, next) => {
  try {
    const parsed = upcomingSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const fromDate =
      parsed.data.fromDate ||
      new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10);
    const result = getUpcomingShiftDatesForTelegramId({
      telegramId: req.user.telegramId,
      fromDate,
      limit: parsed.data.limit || 4
    });

    return res.json({
      fromDate,
      employee: result.employee,
      shifts: result.shifts
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me/finances", (req, res, next) => {
  try {
    const parsed = monthSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Выберите корректный месяц",
        issues: parsed.error.flatten()
      });
    }

    const aliases = employeeFinanceAliases(req.employee);
    if (!aliases.size) {
      return res.status(404).json({
        error: "NotFound",
        message: "Сотрудник не найден"
      });
    }

    const locations = listLocations();
    const shifts = [];
    for (const location of locations) {
      const schedule = getScheduleForMonth({
        locationCode: location.code,
        month: parsed.data.month
      });
      const paymentData = listShiftPaymentsForMonth({
        locationCode: location.code,
        month: parsed.data.month
      });
      const paymentMap = new Map(
        (paymentData?.shiftPayments || [])
          .filter((payment) => aliases.has(normalizeFinanceEmployeeName(payment.employeeName)))
          .map((payment) => [String(payment.shiftDate), payment])
      );

      for (const row of schedule?.shifts || []) {
        const executor1 = normalizeFinanceEmployeeName(row.executor1);
        const executor2 = normalizeFinanceEmployeeName(row.executor2);
        const slot = aliases.has(executor1) ? 1 : aliases.has(executor2) ? 2 : 0;
        if (!slot) continue;

        const payment = paymentMap.get(String(row.date)) || null;
        const currentSalary = Number(slot === 1 ? row.rate1 : row.rate2) || 0;
        const currentDeductions = Math.abs(
          Math.min(0, Number(slot === 1 ? row.deductions1 : row.deductions2) || 0)
        );
        const currentBonuses = Math.max(
          0,
          Number(slot === 1 ? row.bonuses1 : row.bonuses2) || 0
        );
        const salary = payment ? Number(payment.salaryAmount || 0) : currentSalary;
        const deductions = payment
          ? Number(payment.deductionsAmount || 0)
          : currentDeductions;
        const bonuses = payment ? Number(payment.bonusesAmount || 0) : currentBonuses;
        const paid = payment ? Number(payment.paidAmount || 0) : 0;
        const deductionMeta = slot === 1 ? row.deductions1Meta : row.deductions2Meta;
        const bonusMeta = slot === 1 ? row.bonuses1Meta : row.bonuses2Meta;
        const workStart = slot === 1 ? row.executor1Start : row.executor2Start;
        const workEnd = slot === 1 ? row.executor1End : row.executor2End;
        const workedMinutes = Math.max(0, timeToMinutes(workEnd) - timeToMinutes(workStart));

        shifts.push({
          date: row.date,
          locationCode: location.code,
          locationTitle: location.title,
          executorSlot: slot,
          workStart,
          workEnd,
          workedMinutes: Number.isFinite(workedMinutes) ? workedMinutes : 0,
          dailyRate: Number(row.dailyRate || 0),
          salary,
          deductions,
          bonuses,
          accrued: salary + bonuses - deductions,
          paid,
          balance: salary + bonuses - deductions - paid,
          deductionItems: normalizeFinanceItems(
            deductionMeta,
            "Удержание",
            deductions
          ),
          bonusItems: normalizeFinanceItems(bonusMeta, "Доплата", bonuses),
          payment: payment
            ? {
                id: payment.id,
                amount: paid,
                paidAt: payment.paidAt,
                reason: `Оплата смены ${row.date}`
              }
            : null
        });
      }
    }

    shifts.sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.locationTitle).localeCompare(String(b.locationTitle), "ru")
    );
    const summary = shifts.reduce(
      (totals, shift) => ({
        shiftCount: totals.shiftCount + 1,
        salary: totals.salary + shift.salary,
        deductions: totals.deductions + shift.deductions,
        bonuses: totals.bonuses + shift.bonuses,
        accrued: totals.accrued + shift.accrued,
        paid: totals.paid + shift.paid,
        balance: totals.balance + shift.balance
      }),
      {
        shiftCount: 0,
        salary: 0,
        deductions: 0,
        bonuses: 0,
        accrued: 0,
        paid: 0,
        balance: 0
      }
    );

    return res.json({
      month: parsed.data.month,
      employee: {
        id: req.employee.id,
        fullName: req.employee.fullName
      },
      summary,
      shifts
    });
  } catch (error) {
    return next(error);
  }
});

router.use("/:locationCode", requireEmployeeLocationAccess);

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

    const privilegedPosition = ["owner", "owner_manager"].includes(
      String(req.employee?.position || "")
    );
    const participantLimited =
      req.user?.role === Role.PARTICIPANT && !privilegedPosition;
    if (participantLimited) {
      return res.json({
        ...schedule,
        shifts: (schedule.shifts || []).map((shift) => ({
          date: shift.date,
          executor1: shift.executor1 || "",
          executor2: shift.executor2 || ""
        }))
      });
    }

    return res.json(schedule);
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/:locationCode/payments",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
  try {
    const parsed = monthSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const data = listFinancePaymentsForMonth({
      locationCode: req.params.locationCode,
      month: parsed.data.month
    });

    if (!data) {
      return res.status(404).json({
        error: "NotFound",
        message: "Location was not found"
      });
    }

    return res.json(data);
  } catch (error) {
    return next(error);
  }
  }
);

router.get(
  "/:locationCode/shift-payments",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
  try {
    const parsed = monthSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const data = listShiftPaymentsForMonth({
      locationCode: req.params.locationCode,
      month: parsed.data.month
    });
    if (!data) {
      return res.status(404).json({
        error: "NotFound",
        message: "Location was not found"
      });
    }
    return res.json(data);
  } catch (error) {
    return next(error);
  }
  }
);

const shiftSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  executor1: z.string().max(120).default(""),
  executor2: z.string().max(120).default(""),
  executor1Start: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
  executor1End: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
  executor2Start: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
  executor2End: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
  dailyRate: z.coerce.number().min(0).max(1000000).optional(),
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

    const normalizedExecutor1 = parsed.data.executor1.trim();
    const normalizedExecutor2 = parsed.data.executor2.trim();
    if (!normalizedExecutor1 && normalizedExecutor2) {
      return res.status(409).json({
        error: "ValidationError",
        message: "Сначала заполните Исполнитель1, потом Исполнитель2"
      });
    }
    const employeesByName = new Map(
      listEmployees().map((employee) => [
        String(employee.fullName || "").trim().toLowerCase(),
        employee
      ])
    );
    for (const employeeName of [normalizedExecutor1, normalizedExecutor2].filter(Boolean)) {
      const employee = employeesByName.get(employeeName.toLowerCase());
      if (
        employee &&
        !employee.locationCodes.includes(String(req.params.locationCode))
      ) {
        return res.status(409).json({
          error: "ValidationError",
          message: `${employee.fullName} не назначен(а) на этот ПВЗ`
        });
      }
    }
    const executorsCheck = validateShiftExecutors({
      locationCode: req.params.locationCode,
      date: parsed.data.date,
      executor1: normalizedExecutor1,
      executor2: normalizedExecutor2
    });
    if (!executorsCheck.ok) {
      return res.status(409).json({
        error: "ValidationError",
        message: executorsCheck.message,
        details: executorsCheck
      });
    }

    const location = listLocations().find(
      (item) => String(item.code) === String(req.params.locationCode)
    );
    if (!location) {
      return res.status(404).json({
        error: "NotFound",
        message: "ПВЗ не найден"
      });
    }
    const dailyRate =
      parsed.data.dailyRate == null
        ? Math.max(0, Number(parsed.data.rate1 || 0) + Number(parsed.data.rate2 || 0))
        : Number(parsed.data.dailyRate || 0);
    const rateCalculation = calculateShiftRates({
      dailyRate,
      locationWorkStart: location.workStart,
      locationWorkEnd: location.workEnd,
      executor1: normalizedExecutor1,
      executor2: normalizedExecutor2,
      executor1Start: parsed.data.executor1Start,
      executor1End: parsed.data.executor1End,
      executor2Start: parsed.data.executor2Start,
      executor2End: parsed.data.executor2End
    });
    if (!rateCalculation.ok) {
      return res.status(409).json({
        error: "ValidationError",
        message: rateCalculation.message
      });
    }

    const shift = upsertShift({
      locationCode: req.params.locationCode,
      date: parsed.data.date,
      executor1: normalizedExecutor1,
      executor2: normalizedExecutor2,
      executor1Start: rateCalculation.executor1Start,
      executor1End: rateCalculation.executor1End,
      executor2Start: rateCalculation.executor2Start,
      executor2End: rateCalculation.executor2End,
      dailyRate,
      rate1: rateCalculation.rate1,
      rate2: rateCalculation.rate2,
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
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "SHIFT_UPDATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        locationCode: req.params.locationCode,
        date: parsed.data.date,
        executor1: normalizedExecutor1,
        executor2: normalizedExecutor2,
        executor1Start: rateCalculation.executor1Start,
        executor1End: rateCalculation.executor1End,
        executor2Start: rateCalculation.executor2Start,
        executor2End: rateCalculation.executor2End,
        dailyRate,
        rate1: rateCalculation.rate1,
        rate2: rateCalculation.rate2
      },
      systemView: "ALL_ADMINS"
    });

    return res.json({ shift });
  } catch (error) {
    return next(error);
  }
});

const financePaymentSchema = z.object({
  employeeName: z.string().trim().min(3).max(120),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  operationType: z.enum(["payout", "advance"]).default("payout"),
  amount: z.coerce.number().positive().max(1000000)
});

const shiftPaymentSchema = z.object({
  employeeName: z.string().trim().min(3).max(120),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const bulkShiftPaymentSchema = z.object({
  employeeName: z.string().trim().min(3).max(120),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  period: z.enum(["first", "second"])
});

router.post(
  "/:locationCode/shift-payments/pay-period",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
    try {
      const parsed = bulkShiftPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const result = markEmployeePeriodPaid({
        locationCode: req.params.locationCode,
        month: parsed.data.month,
        period: parsed.data.period,
        employeeName: parsed.data.employeeName,
        createdByTelegramId: req.user?.telegramId || ""
      });
      if (!result) {
        return res.status(404).json({
          error: "NotFound",
          message: "ПВЗ не найден"
        });
      }

      logAuditEvent({
        scope: "SYSTEM",
        eventType: "FINANCE_EMPLOYEE_PERIOD_PAID",
        actorUser: req.user,
        actorTelegramId: req.user.telegramId,
        actorRole: req.user.role,
        sessionId: req.session?.id || "",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: {
          locationCode: req.params.locationCode,
          employeeName: parsed.data.employeeName,
          month: parsed.data.month,
          period: parsed.data.period,
          periodFrom: result.periodFrom,
          periodTo: result.periodTo,
          paidShiftCount: result.count,
          amount: result.totalAmount
        },
        systemView: "ALL_ADMINS"
      });

      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/:locationCode/shift-payments",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
    try {
      const parsed = shiftPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const payment = markShiftPaid({
        locationCode: req.params.locationCode,
        shiftDate: parsed.data.shiftDate,
        employeeName: parsed.data.employeeName,
        createdByTelegramId: req.user?.telegramId || ""
      });
      if (!payment) {
        return res.status(404).json({
          error: "NotFound",
          message: "Смена сотрудника не найдена"
        });
      }

      logAuditEvent({
        scope: "SYSTEM",
        eventType: "FINANCE_SHIFT_PAID",
        actorUser: req.user,
        actorTelegramId: req.user.telegramId,
        actorRole: req.user.role,
        sessionId: req.session?.id || "",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: {
          locationCode: req.params.locationCode,
          employeeName: parsed.data.employeeName,
          shiftDate: parsed.data.shiftDate,
          amount: payment.paid_amount
        },
        systemView: "ALL_ADMINS"
      });

      return res.status(201).json({
        shiftPayment: {
          id: payment.id,
          shiftDate: payment.shift_date,
          employeeName: payment.employee_name,
          salaryAmount: Number(payment.salary_amount || 0),
          deductionsAmount: Number(payment.deductions_amount || 0),
          bonusesAmount: Number(payment.bonuses_amount || 0),
          paidAmount: Number(payment.paid_amount || 0),
          paidAt: payment.paid_at
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  "/:locationCode/shift-payments/:paymentId",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
    try {
      const deleted = unmarkShiftPaid({
        locationCode: req.params.locationCode,
        paymentId: req.params.paymentId
      });
      if (!deleted) {
        return res.status(404).json({
          error: "NotFound",
          message: "Оплата смены не найдена"
        });
      }

      logAuditEvent({
        scope: "SYSTEM",
        eventType: "FINANCE_SHIFT_PAYMENT_CANCELLED",
        actorUser: req.user,
        actorTelegramId: req.user.telegramId,
        actorRole: req.user.role,
        sessionId: req.session?.id || "",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: {
          locationCode: req.params.locationCode,
          employeeName: deleted.employeeName,
          shiftDate: deleted.shiftDate,
          amount: deleted.paidAmount
        },
        systemView: "ALL_ADMINS"
      });

      return res.json({ ok: true, shiftPayment: deleted });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/:locationCode/payments",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
  try {
    const parsed = financePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const payment = createFinancePayment({
      locationCode: req.params.locationCode,
      employeeName: parsed.data.employeeName,
      paymentDate: parsed.data.paymentDate,
      periodFrom: parsed.data.periodFrom,
      periodTo: parsed.data.periodTo,
      paymentType: parsed.data.operationType,
      amount: parsed.data.amount,
      createdByTelegramId: req.user?.telegramId || ""
    });

    if (!payment) {
      return res.status(404).json({
        error: "NotFound",
        message: "Location was not found"
      });
    }
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "FINANCE_PAYMENT_CREATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        locationCode: req.params.locationCode,
        employeeName: parsed.data.employeeName,
        paymentDate: parsed.data.paymentDate,
        operationType: parsed.data.operationType,
        amount: parsed.data.amount
      },
      systemView: "ALL_ADMINS"
    });

    return res.status(201).json({
      payment: {
        id: payment.id,
        employeeName: payment.employee_name,
        paymentDate: payment.payment_date,
        periodFrom: payment.period_from || "",
        periodTo: payment.period_to || "",
        operationType: payment.payment_type || "payout",
        amount: payment.amount,
        createdByTelegramId: payment.created_by_telegram_id,
        createdAt: payment.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.delete(
  "/:locationCode/payments/:paymentId",
  requirePosition("owner", "owner_manager"),
  (req, res, next) => {
    try {
      const paymentId = Number(req.params.paymentId);
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid payment id"
        });
      }

      const deleted = deleteFinancePayment({
        locationCode: req.params.locationCode,
        paymentId
      });

      if (!deleted) {
        return res.status(404).json({
          error: "NotFound",
          message: "Payment was not found"
        });
      }
      logAuditEvent({
        scope: "SYSTEM",
        eventType: "FINANCE_PAYMENT_DELETED",
        actorUser: req.user,
        actorTelegramId: req.user.telegramId,
        actorRole: req.user.role,
        sessionId: req.session?.id || "",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        meta: {
          locationCode: req.params.locationCode,
          paymentId: deleted.id,
          employeeName: deleted.employeeName,
          amount: deleted.amount,
          operationType: deleted.paymentType
        },
        systemView: "ALL_ADMINS"
      });

      return res.json({ deleted });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
