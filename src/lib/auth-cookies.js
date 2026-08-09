const AUTH_COOKIE_NAME = "pvz_auth_id";
const SESSION_COOKIE_NAME = "pvz_session_id";
import { env } from "../config/env.js";

const COOKIE_MAX_AGE_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function isSecureRequest(req) {
  const forwardedProto = String(req.header("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return req.secure || forwardedProto === "https";
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/"
  };
}

export function readAuthCookies(req) {
  const result = {};
  const source = String(req.headers.cookie || "");

  for (const part of source.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) continue;
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }

  return {
    authId: String(result[AUTH_COOKIE_NAME] || "").trim(),
    sessionId: String(result[SESSION_COOKIE_NAME] || "").trim()
  };
}

export function setAuthCookies(req, res, { authId, sessionId }) {
  const options = cookieOptions(req);
  res.cookie(AUTH_COOKIE_NAME, String(authId || "").trim(), options);
  res.cookie(SESSION_COOKIE_NAME, String(sessionId || "").trim(), options);
}

export function clearAuthCookies(req, res) {
  const options = cookieOptions(req);
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
  res.clearCookie(SESSION_COOKIE_NAME, options);
}
