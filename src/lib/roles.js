import { env } from "../config/env.js";

export const Role = {
  ADMIN: "ADMIN",
  EMPLOYEE: "EMPLOYEE"
};

export function getAdminTelegramIds() {
  return new Set(
    env.ADMIN_TELEGRAM_IDS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}
