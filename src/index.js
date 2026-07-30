import cors from "cors";
import compression from "compression";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import scheduleRoutes from "./routes/schedule.routes.js";
import employeesRoutes from "./routes/employees.routes.js";
import securityRoutes from "./routes/security.routes.js";
import { startShiftReminders } from "./services/shift-reminders.js";
import { configureTelegramMenu } from "./services/telegram-menu.js";

const app = express();
app.set("trust proxy", 1);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const iconsDir = path.join(publicDir, "icons");

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(
  "/icons",
  express.static(iconsDir, {
    maxAge: "30d",
    etag: true
  })
);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", req.path.startsWith("/api") ? "no-store" : "no-cache");
  next();
});
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/security", securityRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: "InternalServerError",
    message: "Something went wrong"
  });
});

app.listen(env.PORT, env.HOST, () => {
  console.log(`API is running on http://${env.HOST}:${env.PORT}`);
  startShiftReminders();
  configureTelegramMenu().catch((error) => {
    console.error("[telegram-menu] configuration failed:", error.message);
  });
});
