import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { validateUploadedFileSignature } from "../src/services/file-signature.js";

test("accepts a real PNG signature and rejects disguised text", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pvz-signature-"));
  const pngPath = path.join(directory, "real.png");
  const fakePath = path.join(directory, "fake.png");
  fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  fs.writeFileSync(fakePath, "not an image", "utf8");

  assert.deepEqual(
    validateUploadedFileSignature(
      { path: pngPath },
      new Set(["image/png", "image/jpeg"])
    ),
    { ok: true, mimeType: "image/png" }
  );
  assert.equal(
    validateUploadedFileSignature(
      { path: fakePath },
      new Set(["image/png", "image/jpeg"])
    ).ok,
    false
  );

  fs.rmSync(directory, { recursive: true, force: true });
});
