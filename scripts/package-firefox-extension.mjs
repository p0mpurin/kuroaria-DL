/**
 * Build a Firefox/AMO-ready .zip with POSIX paths (lib/foo.js not lib\foo.js).
 * Do NOT use PowerShell Compress-Archive — AMO rejects backslashes in entry names.
 */
import archiver from "archiver";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yauzl from "yauzl";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "extension", "firefox");
const outDir = join(root, "dist-extensions");
const out = join(outDir, "kuroaria-dl-firefox.zip");

function validateZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const bad = [];
      zip.on("entry", (entry) => {
        if (entry.fileName.includes("\\")) {
          bad.push(entry.fileName);
        }
        zip.readEntry();
      });
      zip.on("end", () => {
        zip.close();
        if (bad.length) {
          reject(
            new Error(
              `Invalid ZIP paths (backslashes). AMO will reject:\n${bad.map((p) => `  - ${p}`).join("\n")}`,
            ),
          );
        } else {
          resolve();
        }
      });
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

function createZip() {
  return new Promise((resolve, reject) => {
    mkdirSync(outDir, { recursive: true });
    if (existsSync(out)) rmSync(out);

    const output = createWriteStream(out);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
    archive.pipe(output);
    // false = manifest.json at archive root (required for AMO)
    archive.directory(src, false);
    archive.finalize();
  });
}

const bytes = await createZip();
await validateZip(out);
console.log(`OK: ${out} (${bytes} bytes, forward-slash paths only)`);
