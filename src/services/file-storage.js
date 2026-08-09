import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

function prepareStorageRoot(configuredPath) {
  const root = path.resolve(configuredPath);
  try {
    fs.mkdirSync(root, { recursive: true });
    return root;
  } catch (error) {
    if (root.startsWith(path.resolve("/data"))) {
      const fallback = path.resolve(process.cwd(), "data", "files");
      fs.mkdirSync(fallback, { recursive: true });
      console.warn(`[files] ${root} is unavailable. Falling back to ${fallback}.`);
      return fallback;
    }
    throw error;
  }
}

export const secureFileRoot = prepareStorageRoot(env.FILE_STORAGE_PATH);
export const secureUploadTempDirectory = path.join(secureFileRoot, ".uploads");
fs.mkdirSync(secureUploadTempDirectory, { recursive: true });

function relativePathForId(id) {
  const safeId = String(id || "").replace(/[^0-9a-f-]/gi, "");
  return path.join(safeId.slice(0, 2) || "00", safeId);
}

export function resolveSecureFilePath(relativePath) {
  const resolved = path.resolve(secureFileRoot, String(relativePath || ""));
  const prefix = `${secureFileRoot}${path.sep}`;
  if (resolved !== secureFileRoot && !resolved.startsWith(prefix)) {
    throw new Error("Invalid secure file path");
  }
  return resolved;
}

export function persistSecureFile({ id, sourcePath = "", content = null }) {
  const relativePath = relativePathForId(id);
  const destination = resolveSecureFilePath(relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  // A restart can happen after the file is written but before SQLite is updated.
  if (fs.existsSync(destination)) {
    removeTemporaryUpload(sourcePath);
    return {
      relativePath,
      absolutePath: destination,
      sizeBytes: fs.statSync(destination).size
    };
  }

  if (sourcePath) {
    try {
      fs.renameSync(sourcePath, destination);
    } catch (error) {
      if (error.code !== "EXDEV") throw error;
      fs.copyFileSync(sourcePath, destination);
      fs.unlinkSync(sourcePath);
    }
  } else {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content || "");
    const temporary = `${destination}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, buffer, { flag: "wx" });
    fs.renameSync(temporary, destination);
  }

  return {
    relativePath,
    absolutePath: destination,
    sizeBytes: fs.statSync(destination).size
  };
}

export function removeStoredFile(relativePath) {
  if (!relativePath) return;
  try {
    fs.unlinkSync(resolveSecureFilePath(relativePath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function removeTemporaryUpload(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  const prefix = `${secureUploadTempDirectory}${path.sep}`;
  if (!resolved.startsWith(prefix)) return;
  try {
    fs.unlinkSync(resolved);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
