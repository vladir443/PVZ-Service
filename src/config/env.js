import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const defaultDatabasePath = process.env.AMVERA
  ? "/data/grafik.db"
  : "./data/grafik.db";
const defaultFileStoragePath = process.env.AMVERA
  ? "/data/files"
  : "./data/files";
const defaultBackupPath = process.env.AMVERA
  ? "/data/backups"
  : "./backups";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PATH: z.string().min(1).default(defaultDatabasePath),
  FILE_STORAGE_PATH: z.string().min(1).default(defaultFileStoragePath),
  BACKUP_PATH: z.string().min(1).default(defaultBackupPath),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  PUBLIC_APP_URL: z
    .string()
    .url()
    .default("https://pvz-group-fildy11.amvera.io"),
  CORS_ORIGINS: z.string().default("https://pvzgroup.ru,https://www.pvzgroup.ru"),
  ADMIN_TELEGRAM_IDS: z.string().default(""),
  SMTP_HOST: z.string().default("smtp.yandex.ru"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.string().default("true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default("")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = parsed.data;
