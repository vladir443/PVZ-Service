import { env } from "../config/env.js";

export async function configureTelegramMenu() {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    console.log("[telegram-menu] skipped: TELEGRAM_BOT_TOKEN is empty");
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/setChatMenuButton`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "Открыть PVZ Group",
          web_app: {
            url: env.PUBLIC_APP_URL
          }
        }
      })
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram menu update failed: ${response.status} ${
        result.description || "unknown error"
      }`
    );
  }

  console.log(`[telegram-menu] configured: ${env.PUBLIC_APP_URL}`);
}
