# Git hooks (optional local setup)

These hooks are **not** enabled automatically (repo does not modify your git config).

To opt in:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit   # Unix/macOS/WSL
```

## pre-commit

Runs `node scripts/check-migration-version-uniqueness.mjs` to reject commits that introduce duplicate Supabase migration version prefixes (e.g. two files named `164_*.sql`).

CI runs the same check on every push/PR via `.github/workflows/production-gate.yml`.
