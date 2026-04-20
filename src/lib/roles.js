import { env } from "../config/env.js";

export const Role = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  PARTICIPANT: "PARTICIPANT"
};

export const DbRole = {
  ADMIN: "ADMIN",
  EMPLOYEE: "EMPLOYEE"
};

export function toDbRole(appRole) {
  return appRole === Role.ADMIN || appRole === Role.SUPERADMIN ? DbRole.ADMIN : DbRole.EMPLOYEE;
}

export function fromDbRole(dbRole, isSuperAdmin) {
  if (isSuperAdmin) return Role.SUPERADMIN;
  return dbRole === DbRole.ADMIN ? Role.ADMIN : Role.PARTICIPANT;
}

export function getAdminTelegramIds() {
  return new Set(
    env.ADMIN_TELEGRAM_IDS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}
