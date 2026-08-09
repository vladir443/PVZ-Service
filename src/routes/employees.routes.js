import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import {
  createSecureFile,
  createEmployee,
  deleteSecureFileById,
  deleteEmployeeById,
  getSecureFileById,
  getUserByTelegramId,
  listAllEmployeeDocuments,
  listEmployeeDocuments,
  listEmployees,
  listLocations,
  logAuditEvent,
  migratePhoneUserToEmail,
  replaceEmployeeLocations,
  updateEmployeeAvatarById,
  updateUserRole,
  updateEmployeeById
} from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "../lib/roles.js";
import { setAuthCookies } from "../lib/auth-cookies.js";
import {
  removeTemporaryUpload,
  secureUploadTempDirectory
} from "../services/file-storage.js";

const router = express.Router();

const passportMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);
const passportUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, secureUploadTempDirectory),
    filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(
      passportMimeTypes.has(String(file.mimetype || "").toLowerCase())
        ? null
        : new Error("Разрешены PDF, JPG, PNG и WEBP"),
      passportMimeTypes.has(String(file.mimetype || "").toLowerCase())
    );
  }
});
const employeePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, secureUploadTempDirectory),
    filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"].includes(
      String(file.mimetype || "").toLowerCase()
    );
    callback(allowed ? null : new Error("Разрешены изображения JPG, PNG и WEBP"), allowed);
  }
});

function decodeUploadFileName(value) {
  const name = String(value || "file");
  if (!/[ÐÑ]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("�") ? name : decoded;
  } catch {
    return name;
  }
}

function receivePassportFile(req, res, next) {
  passportUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Файл паспорта должен быть не больше 10 МБ"
      : error.message || "Не удалось загрузить документ";
    return res.status(400).json({ error: "UploadError", message });
  });
}

function receiveEmployeePhoto(req, res, next) {
  employeePhotoUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Фотография сотрудника должна быть не больше 5 МБ"
      : error.message || "Не удалось загрузить фотографию";
    return res.status(400).json({ error: "UploadError", message });
  });
}

router.get("/:id/photo", requireAuth, (req, res, next) => {
  try {
    const employeeId = Number(req.params.id);
    const file = getSecureFileById(req.query.file, { includeReadPath: true });
    if (
      !Number.isInteger(employeeId) ||
      !file ||
      file.category !== "EMPLOYEE_PHOTO" ||
      file.employeeId !== employeeId
    ) {
      return res.status(404).json({ error: "NotFound", message: "Фотография не найдена" });
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(file.readPath);
  } catch (error) {
    return next(error);
  }
});

router.use(requireAuth, requireRole(Role.ADMIN, Role.SUPERADMIN));

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isActorSelfTarget({ targetEmployee, actorUser }) {
  const actorTelegramId = String(actorUser?.telegramId || "").trim();
  const targetTelegramId = String(targetEmployee?.telegramId || "").trim();
  if (actorTelegramId && targetTelegramId && actorTelegramId === targetTelegramId) {
    return true;
  }
  const actorFullName = normalizeText(actorUser?.fullName);
  const targetFullName = normalizeText(targetEmployee?.fullName);
  return !!actorFullName && !!targetFullName && actorFullName === targetFullName;
}

function canManageEmployeeDocuments({ targetEmployee, actorUser }) {
  const isSelf = isActorSelfTarget({ targetEmployee, actorUser });
  if (targetEmployee.isProtected) {
    return actorUser.role === Role.SUPERADMIN && isSelf;
  }
  if (actorUser.role === Role.SUPERADMIN) return true;
  if (actorUser.role !== Role.ADMIN) return false;
  return isSelf || targetEmployee.accessRole === Role.PARTICIPANT;
}

function getDocumentTarget(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ValidationError", message: "Некорректный id сотрудника" });
    return null;
  }
  const employee = listEmployees().find((item) => item.id === id);
  if (!employee) {
    res.status(404).json({ error: "NotFound", message: "Сотрудник не найден" });
    return null;
  }
  if (!canManageEmployeeDocuments({ targetEmployee: employee, actorUser: req.user })) {
    res.status(403).json({ error: "Forbidden", message: "Недостаточно прав для документов сотрудника" });
    return null;
  }
  return employee;
}

router.get("/", (_req, res, next) => {
  try {
    const documentsByEmployee = new Map();
    for (const document of listAllEmployeeDocuments()) {
      const documents = documentsByEmployee.get(document.employeeId) || [];
      documents.push(document);
      documentsByEmployee.set(document.employeeId, documents);
    }
    const employees = listEmployees().map((employee) => ({
      ...employee,
      documents: documentsByEmployee.get(employee.id) || []
    }));
    return res.json({ employees, locations: listLocations() });
  } catch (error) {
    return next(error);
  }
});

const contactSchema = z.object({
  firstName: z.string().trim().min(3).max(60),
  lastName: z.string().trim().min(3).max(60),
  telegramId: z.string().trim().max(64).optional().default(""),
  avatarUrl: z.string().trim().max(500).optional().default(""),
  email: z.string().trim().email("Укажите корректную почту").max(254),
  phone: z.string().trim().min(1).max(30),
  telegramContact: z.string().trim().max(120).optional().default(""),
  vkContact: z.string().trim().max(200).optional().default(""),
  position: z.enum(["owner", "owner_manager", "senior_manager", "manager", "intern"]),
  reliability: z.enum(["reliable", "checking", "borderline"]),
  locationCodes: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  accessRole: z.enum([Role.ADMIN, Role.PARTICIPANT]).optional().default(Role.PARTICIPANT)
});

function validateLocationCodes(locationCodes) {
  const allowedCodes = new Set(listLocations().map((location) => location.code));
  const normalizedCodes = [...new Set(locationCodes.map((code) => String(code).trim()))];
  if (!normalizedCodes.length) {
    return { ok: false, message: "Выберите минимум один ПВЗ", locationCodes: [] };
  }
  const unknownCode = normalizedCodes.find((code) => !allowedCodes.has(code));
  if (unknownCode) {
    return { ok: false, message: "Выбран неизвестный ПВЗ", locationCodes: [] };
  }
  return { ok: true, locationCodes: normalizedCodes };
}

function validateContacts(data) {
  const digits = String(data.phone).replace(/\D/g, "");
  if (digits.length !== 11 || digits[0] !== "7") {
    return "Телефон должен быть в формате +7 999 999-99-99 (11 цифр, начиная с 7)";
  }

  if (data.telegramContact && !/^@?[a-zA-Z0-9_]{5,}$/.test(data.telegramContact)) {
    return "Telegram контакт укажи как username: @username";
  }

  if (
    data.vkContact &&
    !/^https?:\/\/(vk\.ru|m\.vk\.ru|vk\.com|m\.vk\.com)\/[A-Za-z0-9_.-]+$/i.test(
      data.vkContact
    )
  ) {
    return "VK контакт укажи ссылкой вида https://vk.ru/username";
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
    const locationsValidation = validateLocationCodes(parsed.data.locationCodes);
    if (!locationsValidation.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message: locationsValidation.message
      });
    }

    const employee = createEmployee({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      telegramId: parsed.data.telegramId,
      avatarUrl: parsed.data.avatarUrl,
      email: parsed.data.email,
      phone: parsed.data.phone,
      telegramContact: parsed.data.telegramContact,
      vkContact: parsed.data.vkContact,
      position: parsed.data.position,
      reliability: parsed.data.reliability,
      accessRole: parsed.data.accessRole
    });
    employee.locations = replaceEmployeeLocations(employee.id, locationsValidation.locationCodes);
    employee.locationCodes = employee.locations.map((location) => location.code);

    logAuditEvent({
      scope: "SYSTEM",
      eventType: "EMPLOYEE_CREATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: employee.telegramId || "",
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        employeeId: employee.id,
        fullName: employee.fullName,
        accessRole: employee.accessRole,
        locationCodes: employee.locationCodes
      },
      systemView: "ALL_ADMINS"
    });

    return res.status(201).json({ employee });
  } catch (error) {
    if (String(error.message || "").includes("employees.email")) {
      return res.status(409).json({
        error: "Conflict",
        message: "Эта почта уже привязана к другому сотруднику"
      });
    }
    if (String(error.message || "").includes("UNIQUE")) {
      return res.status(409).json({
        error: "Conflict",
        message: "Сотрудник с таким именем уже существует"
      });
    }
    return next(error);
  }
});

router.get("/:id/documents", (req, res, next) => {
  try {
    const employee = getDocumentTarget(req, res);
    if (!employee) return;
    return res.json({ documents: listEmployeeDocuments(employee.id) });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/documents", receivePassportFile, (req, res, next) => {
  try {
    const employee = getDocumentTarget(req, res);
    if (!employee) {
      removeTemporaryUpload(req.file?.path);
      return;
    }
    if (!req.file?.path || !req.file.size) {
      return res.status(400).json({ error: "ValidationError", message: "Выберите документ" });
    }
    const document = createSecureFile({
      category: "EMPLOYEE_PASSPORT",
      employeeId: employee.id,
      originalName: decodeUploadFileName(req.file.originalname),
      mimeType: req.file.mimetype,
      sourcePath: req.file.path,
      uploadedByUserId: req.user.id
    });
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "EMPLOYEE_DOCUMENT_UPLOADED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: employee.telegramId || "",
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { employeeId: employee.id, fileId: document.id, fileName: document.originalName },
      systemView: "ALL_ADMINS"
    });
    return res.status(201).json({ document });
  } catch (error) {
    removeTemporaryUpload(req.file?.path);
    return next(error);
  }
});

router.get("/:id/documents/:fileId", (req, res, next) => {
  try {
    const employee = getDocumentTarget(req, res);
    if (!employee) return;
    const file = getSecureFileById(req.params.fileId, { includeReadPath: true });
    if (!file || file.category !== "EMPLOYEE_PASSPORT" || file.employeeId !== employee.id) {
      return res.status(404).json({ error: "NotFound", message: "Документ не найден" });
    }
    const safeName = String(file.originalName || "document").replace(/[\r\n"\\]/g, "_");
    const asciiName = safeName.replace(/[^\x20-\x7e]/g, "_");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(file.readPath);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/photo", receiveEmployeePhoto, (req, res, next) => {
  try {
    const employee = getDocumentTarget(req, res);
    if (!employee) {
      removeTemporaryUpload(req.file?.path);
      return;
    }
    if (!req.file?.path || !req.file.size) {
      return res.status(400).json({ error: "ValidationError", message: "Выберите фотографию" });
    }
    const previousPhotoMatch = String(employee.avatarUrl || "").match(/[?&]file=([0-9a-f-]{36})/i);
    const photo = createSecureFile({
      category: "EMPLOYEE_PHOTO",
      employeeId: employee.id,
      originalName: decodeUploadFileName(req.file.originalname),
      mimeType: req.file.mimetype,
      sourcePath: req.file.path,
      uploadedByUserId: req.user.id
    });
    const avatarUrl = `/api/employees/${employee.id}/photo?file=${photo.id}`;
    const updatedEmployee = updateEmployeeAvatarById({ id: employee.id, avatarUrl });
    if (previousPhotoMatch?.[1]) deleteSecureFileById(previousPhotoMatch[1]);
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "EMPLOYEE_PHOTO_UPDATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: employee.telegramId || "",
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { employeeId: employee.id, fileId: photo.id, fileName: photo.originalName },
      systemView: "ALL_ADMINS"
    });
    return res.status(201).json({ employee: updatedEmployee, photo });
  } catch (error) {
    removeTemporaryUpload(req.file?.path);
    return next(error);
  }
});

router.delete("/:id/documents/:fileId", (req, res, next) => {
  try {
    const employee = getDocumentTarget(req, res);
    if (!employee) return;
    const file = getSecureFileById(req.params.fileId);
    if (!file || file.category !== "EMPLOYEE_PASSPORT" || file.employeeId !== employee.id) {
      return res.status(404).json({ error: "NotFound", message: "Документ не найден" });
    }
    deleteSecureFileById(file.id);
    logAuditEvent({
      scope: "SYSTEM",
      eventType: "EMPLOYEE_DOCUMENT_DELETED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: employee.telegramId || "",
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { employeeId: employee.id, fileId: file.id, fileName: file.originalName },
      systemView: "ALL_ADMINS"
    });
    return res.json({ ok: true });
  } catch (error) {
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
    const locationsValidation = validateLocationCodes(parsed.data.locationCodes);
    if (!locationsValidation.ok) {
      return res.status(400).json({
        error: "ValidationError",
        message: locationsValidation.message
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
    const isSelf = isActorSelfTarget({ targetEmployee, actorUser: req.user });

    if (actorRole === Role.ADMIN) {
      if (!isSelf && targetRole !== Role.PARTICIPANT) {
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
      email: parsed.data.email,
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
    const authMigration = migratePhoneUserToEmail({
      phone: result.employee.phone,
      previousEmail: targetEmployee.email || "",
      email: result.employee.email
    });
    result.employee.locations = replaceEmployeeLocations(
      result.employee.id,
      locationsValidation.locationCodes
    );
    result.employee.locationCodes = result.employee.locations.map((location) => location.code);

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

    logAuditEvent({
      scope: "SYSTEM",
      eventType: "EMPLOYEE_UPDATED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: result.employee.telegramId || "",
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        employeeId: result.employee.id,
        fullName: result.employee.fullName,
        accessRole: result.employee.accessRole,
        locationCodes: result.employee.locationCodes
      },
      systemView: "ALL_ADMINS"
    });

    const nextAuthId = isSelf && authMigration?.authId ? authMigration.authId : "";
    if (nextAuthId && req.session?.id) {
      setAuthCookies(req, res, { authId: nextAuthId, sessionId: req.session.id });
    }

    return res.json({ employee: result.employee, authId: nextAuthId });
  } catch (error) {
    if (String(error.message || "").includes("employees.email")) {
      return res.status(409).json({
        error: "Conflict",
        message: "Эта почта уже привязана к другому сотруднику"
      });
    }
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
    const isSelf = isActorSelfTarget({ targetEmployee, actorUser: req.user });

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

    logAuditEvent({
      scope: "SYSTEM",
      eventType: "EMPLOYEE_DELETED",
      actorUser: req.user,
      actorTelegramId: req.user.telegramId,
      actorRole: req.user.role,
      targetTelegramId: targetEmployee.telegramId || "",
      sessionId: req.session?.id || "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      meta: {
        employeeId: targetEmployee.id,
        fullName: targetEmployee.fullName,
        accessRole: targetEmployee.accessRole || Role.PARTICIPANT
      },
      systemView: "ALL_ADMINS"
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
