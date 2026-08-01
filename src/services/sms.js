import { env } from "../config/env.js";

const SMS_RU_ENDPOINT = "https://sms.ru/sms/send";

function normalizePhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits.length === 11 && digits.startsWith("7") ? digits : "";
}

function normalizeClientIp(value) {
  const ip = String(value || "").trim().replace(/^::ffff:/, "");
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "";
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return "";
  return ip.slice(0, 120);
}

function buildAuthorizationText(code) {
  return `${code} — код для входа на pvzgroup.ru. Никому не сообщайте код.`;
}

async function sendViaSmsRu({ phone, code, ipAddress }) {
  const phoneDigits = normalizePhoneDigits(phone);
  if (!phoneDigits) throw new Error("SMS_RU_INVALID_PHONE");

  const body = new URLSearchParams({
    api_id: env.SMS_RU_API_ID,
    to: phoneDigits,
    msg: buildAuthorizationText(code),
    json: "1"
  });
  const sender = String(env.SMS_RU_FROM || "").trim();
  const clientIp = normalizeClientIp(ipAddress);
  if (sender) body.set("from", sender);
  if (clientIp) body.set("ip", clientIp);
  if (env.SMS_RU_TEST_MODE === "true" || env.SMS_RU_TEST_MODE === "1") {
    body.set("test", "1");
  }

  const response = await fetch(SMS_RU_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`SMS_RU_HTTP_${response.status}`);

  const data = await response.json().catch(() => null);
  const phoneResult = data?.sms?.[phoneDigits];
  if (Number(data?.status_code) !== 100 || Number(phoneResult?.status_code) !== 100) {
    const statusCode = phoneResult?.status_code ?? data?.status_code ?? "UNKNOWN";
    const statusText = phoneResult?.status_text || data?.status_text || "SMS.RU rejected request";
    throw new Error(`SMS_RU_${statusCode}: ${statusText}`);
  }

  return {
    sent: true,
    provider: "sms.ru",
    messageId: String(phoneResult?.sms_id || "")
  };
}

async function sendViaWebhook({ phone, code }) {
  const response = await fetch(env.SMS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.SMS_WEBHOOK_TOKEN}` } : {})
    },
    body: JSON.stringify({
      phone,
      text: buildAuthorizationText(code),
      code
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`SMS_WEBHOOK_HTTP_${response.status}`);
  return { sent: true, provider: "webhook", messageId: "" };
}

export async function sendSmsCode({ phone, code, ipAddress = "" }) {
  if (env.SMS_RU_API_ID) {
    return sendViaSmsRu({ phone, code, ipAddress });
  }
  if (env.SMS_WEBHOOK_URL) {
    return sendViaWebhook({ phone, code });
  }

  console.log(`[sms-dev] ${phone}: ${code}`);
  return { sent: false, provider: "development", devCode: code, messageId: "" };
}

