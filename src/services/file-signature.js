import fs from "node:fs";

const SIGNATURE_READ_BYTES = 1024;

export function detectFileMimeType(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(SIGNATURE_READ_BYTES);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);

    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      head.length >= 8 &&
      head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return "image/png";
    }
    if (
      head.length >= 12 &&
      head.subarray(0, 4).toString("ascii") === "RIFF" &&
      head.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
    if (head.indexOf(Buffer.from("%PDF-")) >= 0) {
      return "application/pdf";
    }
    return "";
  } finally {
    fs.closeSync(descriptor);
  }
}

export function validateUploadedFileSignature(file, allowedMimeTypes) {
  if (!file?.path) {
    return { ok: false, message: "Файл не получен" };
  }
  const detectedMimeType = detectFileMimeType(file.path);
  if (!detectedMimeType || !allowedMimeTypes.has(detectedMimeType)) {
    return {
      ok: false,
      message: "Содержимое файла не соответствует разрешённому формату"
    };
  }
  return { ok: true, mimeType: detectedMimeType };
}
