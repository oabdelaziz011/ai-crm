---
name: Supabase env vars in Vite (login-app)
description: How to expose non-VITE_ Replit secrets to the Vite browser bundle for Supabase
---

## Rule
Replit secrets named without the `VITE_` prefix (e.g. `SUPABASE_URL`) are not automatically
exposed to Vite's browser bundle. Neither `envPrefix` nor `define` in `vite.config.ts` reliably
solves this because Vite snapshots the env before the config module runs.

## Solution
Write a `.env.local` file at dev-server startup via the `dev` npm script:

```json
"dev": "node -e \"const fs=require('fs');fs.writeFileSync('.env.local','VITE_SUPABASE_URL='+process.env.SUPABASE_URL+'\\nVITE_SUPABASE_PUBLISHABLE_KEY='+process.env.SUPABASE_PUBLISHABLE_KEY+'\\n')\" && vite --config vite.config.ts --host 0.0.0.0"
```

Then read in app code as `import.meta.env.VITE_SUPABASE_URL`.
Add `.env.local` to `.gitignore`.

**Why:** Vite's native VITE_ env handling reads `.env.local` at startup — this is the
only reliable path when secrets use custom prefixes and Vite is the bundler.
