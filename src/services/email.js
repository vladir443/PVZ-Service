import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: ["true", "1", "yes"].includes(String(env.SMTP_SECURE).toLowerCase()),
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  return transporter;
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export async function sendEmailCode({ email, code, purpose = "login" }) {
  const recipient = normalizeEmail(email);
  if (!isValidEmail(recipient)) throw new Error("INVALID_EMAIL");
  const isPinRecovery = purpose === "pin_recovery";
  const heading = isPinRecovery ? "Восстановление PIN-кода" : "Вход в PVZ Group";
  const actionText = isPinRecovery
    ? "Введите этот код для восстановления PIN-кода"
    : "Введите этот код на сайте";

  const info = await getTransporter().sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: recipient,
    subject: isPinRecovery ? "Код восстановления PIN в PVZ Group" : "Код для входа в PVZ Group",
    text: `${code} — код ${isPinRecovery ? "для восстановления PIN-кода" : "для входа"} на pvzgroup.ru. Код действует 10 минут. Никому не сообщайте его.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#14213d">
        <h1 style="font-size:24px;margin:0 0 12px">${heading}</h1>
        <p style="margin:0 0 22px;color:#64748b">${actionText}:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;padding:20px 24px;background:#f1f5f9;border-radius:14px;text-align:center">${code}</div>
        <p style="margin:22px 0 0;color:#64748b;font-size:14px">Код действует 10 минут. Никому не сообщайте его.</p>
      </div>
    `
  });

  return { sent: true, provider: "yandex-smtp", messageId: String(info.messageId || "") };
}
