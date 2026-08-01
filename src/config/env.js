import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const defaultDatabasePath = process.env.AMVERA
  ? "/data/grafik.db"
  : "./data/grafik.db";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PATH: z.string().min(1).default(defaultDatabasePath),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  PUBLIC_APP_URL: z
    .string()
    .url()
    .default("https://pvz-group-fildy11.amvera.io"),
  ADMIN_TELEGRAM_IDS: z.string().default(""),
  SMS_RU_API_ID: z.string().default(""),
  SMS_RU_FROM: z.string().default(""),
  SMS_RU_TEST_MODE: z.string().default("false"),
  SMS_WEBHOOK_URL: z.string().default(""),
  SMS_WEBHOOK_TOKEN: z.string().default("")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = parsed.data;
