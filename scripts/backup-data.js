import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../src/config/env.js";

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(".", "-");
}

function countFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) return 0;
  return fs.readdirSync(directoryPath, { withFileTypes: true }).reduce(
    (total, entry) =>
      total +
      (entry.isDirectory()
        ? countFiles(path.join(directoryPath, entry.name))
        : 1),
    0
  );
}

const databasePath = path.resolve(env.DATABASE_PATH);
const fileStoragePath = path.resolve(env.FILE_STORAGE_PATH);
const backupDirectory = path.resolve(env.BACKUP_PATH, timestamp());
const backupDatabasePath = path.join(backupDirectory, "grafik.db");
const backupFilesPath = path.join(backupDirectory, "files");

if (!fs.existsSync(databasePath)) {
  throw new Error(`Database not found: ${databasePath}`);
}

fs.mkdirSync(backupDirectory, { recursive: true });
const database = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  await database.backup(backupDatabasePath);
} finally {
  database.close();
}

if (fs.existsSync(fileStoragePath)) {
  fs.cpSync(fileStoragePath, backupFilesPath, { recursive: true });
}

const manifest = {
  createdAt: new Date().toISOString(),
  database: "grafik.db",
  filesDirectory: fs.existsSync(backupFilesPath) ? "files" : null,
  filesCount: countFiles(backupFilesPath)
};
fs.writeFileSync(
  path.join(backupDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`Backup created: ${backupDirectory}`);
