import fs from "node:fs";

const s = fs.readFileSync(
  new URL("../dist/public/assets/index-BfCnrUWD.js", import.meta.url),
  "utf8",
);
const imports = [...s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
console.log(imports.join("\n"));
