import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../lib/scheduling-engine/src", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    let content = readFileSync(full, "utf8");
    content = content
      .replaceAll("@/lib/scheduling/", "../")
      .replaceAll("@/lib/supabase", "@supabase/supabase-js")
      .replaceAll("from \"@supabase/supabase-js\"", "from \"@supabase/supabase-js\"")
      .replace(/import \{ supabase \} from "@supabase\/supabase-js";/g, "");
    writeFileSync(full, content, "utf8");
  }
}

walk(root.replace(/\\/g, "/"));
