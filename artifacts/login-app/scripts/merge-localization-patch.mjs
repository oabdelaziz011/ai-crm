import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const patchPath = join(root, "src/locales/localization-patch.json");

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const patch = JSON.parse(readFileSync(patchPath, "utf8"));

for (const locale of ["en", "ar"]) {
  const filePath = join(root, `src/locales/${locale}/common.json`);
  const common = JSON.parse(readFileSync(filePath, "utf8"));
  deepMerge(common, patch[locale]);
  writeFileSync(filePath, `${JSON.stringify(common, null, 2)}\n`, "utf8");
  console.log(`Merged ${locale}/common.json`);
}
