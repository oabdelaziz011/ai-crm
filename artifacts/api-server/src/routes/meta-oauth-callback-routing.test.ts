import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { confineToPathPrefixes } from "../middleware/confine-router-paths.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), "utf8");
}

function mountIndexOrderIndex(source: string, needle: string): number {
  const idx = source.indexOf(needle);
  assert.ok(idx >= 0, `missing mount: ${needle}`);
  return idx;
}

describe("Meta OAuth callback routing contracts", () => {
  it("mounts Instagram and Messenger OAuth routers before global-auth channel routers", () => {
    const source = read("./index.ts");
    const igOauth = mountIndexOrderIndex(source, "router.use(metaInstagramLoginOauthRouter)");
    const msOauth = mountIndexOrderIndex(source, "router.use(metaMessengerLoginOauthRouter)");
    const customerImport = mountIndexOrderIndex(source, "router.use(customerImportRouter)");
    const email = mountIndexOrderIndex(source, "router.use(emailRouter)");
    const whatsapp = mountIndexOrderIndex(source, "router.use(whatsappRouter)");
    const instagram = mountIndexOrderIndex(source, "router.use(instagramRouter)");
    const messenger = mountIndexOrderIndex(source, "router.use(messengerRouter)");

    assert.ok(igOauth < customerImport, "Instagram OAuth must mount before customerImport global auth");
    assert.ok(msOauth < customerImport, "Messenger OAuth must mount before customerImport global auth");
    assert.ok(igOauth < email && msOauth < email);
    assert.ok(igOauth < whatsapp && msOauth < whatsapp);
    assert.ok(igOauth < instagram && msOauth < instagram);
    assert.ok(igOauth < messenger && msOauth < messenger);
  });

  it("keeps public callbacks free of requireSupabaseAuth while protecting start/disconnect", () => {
    const ig = read("./meta-instagram-login-oauth.ts");
    const ms = read("./meta-messenger-login-oauth.ts");

    const igCallback = ig.indexOf('router.get("/oauth/instagram/callback"');
    const igAuthOnStatus = ig.indexOf("requireSupabaseAuth", ig.indexOf("/meta/instagram-login/status"));
    const igConfine = ig.indexOf('confineToPathPrefixes("/oauth/instagram", "/meta/instagram-login")');
    assert.ok(igCallback >= 0);
    assert.ok(igConfine >= 0 && igConfine < igCallback);
    assert.ok(igAuthOnStatus > igCallback);
    assert.match(ig, /\/meta\/instagram-login\/start[\s\S]*requireSupabaseAuth/);

    const msCallback = ms.indexOf('router.get("/oauth/messenger/callback"');
    const msConfine = ms.indexOf('confineToPathPrefixes("/oauth/messenger", "/meta/messenger-oauth")');
    assert.ok(msCallback >= 0);
    assert.ok(msConfine >= 0 && msConfine < msCallback);
    assert.match(ms, /\/meta\/messenger-oauth\/start[\s\S]*requireSupabaseAuth/);
  });

  it("confines messenger/instagram channel routers so they cannot intercept OAuth callbacks", () => {
    const messenger = read("./messenger.ts");
    const instagram = read("./instagram.ts");
    assert.match(messenger, /confineToPathPrefixes\("\/messenger"\)/);
    assert.match(instagram, /confineToPathPrefixes\("\/instagram"\)/);
    const mConfine = messenger.indexOf('confineToPathPrefixes("/messenger")');
    const mAuth = messenger.indexOf("router.use(requireSupabaseAuth)");
    assert.ok(mConfine >= 0 && mConfine < mAuth);
    const iConfine = instagram.indexOf('confineToPathPrefixes("/instagram")');
    const iAuth = instagram.indexOf("router.use(requireSupabaseAuth)");
    assert.ok(iConfine >= 0 && iConfine < iAuth);
  });
});

describe("Meta OAuth callback express mount smoke (no secrets)", () => {
  async function withApp(run: (app: Express) => Promise<void>): Promise<void> {
    const app = express();

    // Simulate the Production failure mode: a root-mounted global-auth router
    // that previously ran before OAuth and returned 401 for provider redirects.
    const leakingChannelRouter = express.Router();
    leakingChannelRouter.use(confineToPathPrefixes("/messenger"));
    leakingChannelRouter.use(requireSupabaseAuth);
    leakingChannelRouter.use(requireCompanyScope("companyId"));
    leakingChannelRouter.post("/messenger/channel-outbound-health", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const igOauth = express.Router();
    igOauth.use(confineToPathPrefixes("/oauth/instagram", "/meta/instagram-login"));
    igOauth.get("/oauth/instagram/callback", (req, res) => {
      // Mimic public callback: no session required; invalid state → redirect, not 401.
      const hasState = typeof req.query.state === "string" && req.query.state.length > 0;
      if (!hasState) {
        res.redirect(302, "http://127.0.0.1:5180/dashboard/settings/instagram?instagram_oauth=error&reason=missing_state");
        return;
      }
      res.redirect(302, "http://127.0.0.1:5180/dashboard/settings/instagram?instagram_oauth=error&reason=invalid_state");
    });
    igOauth.get("/meta/instagram-login/status", requireSupabaseAuth, (_req, res) => {
      res.status(200).json({ ready: false });
    });

    const msOauth = express.Router();
    msOauth.use(confineToPathPrefixes("/oauth/messenger", "/meta/messenger-oauth"));
    msOauth.get("/oauth/messenger/callback", (req, res) => {
      const hasState = typeof req.query.state === "string" && req.query.state.length > 0;
      if (!hasState) {
        res.redirect(302, "http://127.0.0.1:5180/dashboard/settings/messenger?messenger_oauth=error&reason=missing_state");
        return;
      }
      res.redirect(302, "http://127.0.0.1:5180/dashboard/settings/messenger?messenger_oauth=error&reason=invalid_state");
    });

    // Correct order: OAuth before leaking global-auth routers.
    app.use("/api", igOauth);
    app.use("/api", msOauth);
    app.use("/api", leakingChannelRouter);
    app.use("/api", (_req, res) => {
      res.status(404).json({ error: "not_found" });
    });
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const status =
        err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "error";
      const message = err instanceof Error ? err.message : "error";
      res.status(status).json({ error: code, message });
    });

    await run(app);
  }

  it("allows unauthenticated Instagram and Messenger provider callbacks without 401", async () => {
    await withApp(async (app) => {
      const server = app.listen(0);
      try {
        const port = (server.address() as { port: number }).port;
        const ig = await fetch(
          `http://127.0.0.1:${port}/api/oauth/instagram/callback?error=access_denied&state=x`,
          { redirect: "manual" },
        );
        assert.equal(ig.status, 302);
        assert.match(ig.headers.get("location") ?? "", /instagram_oauth=error/);

        const ms = await fetch(
          `http://127.0.0.1:${port}/api/oauth/messenger/callback?error=access_denied`,
          { redirect: "manual" },
        );
        assert.equal(ms.status, 302);
        assert.match(ms.headers.get("location") ?? "", /messenger_oauth=error/);
      } finally {
        await new Promise<void>((resolveClose, rejectClose) => {
          server.close((err) => (err ? rejectClose(err) : resolveClose()));
        });
      }
    });
  });

  it("still requires auth for Instagram Login status while callbacks stay public", async () => {
    await withApp(async (app) => {
      const server = app.listen(0);
      try {
        const port = (server.address() as { port: number }).port;
        const status = await fetch(`http://127.0.0.1:${port}/api/meta/instagram-login/status`);
        assert.equal(status.status, 401);
        const body = (await status.json()) as { error?: string };
        assert.equal(body.error, "unauthorized");

        const callback = await fetch(
          `http://127.0.0.1:${port}/api/oauth/instagram/callback?state=test`,
          { redirect: "manual" },
        );
        assert.equal(callback.status, 302);
      } finally {
        await new Promise<void>((resolveClose, rejectClose) => {
          server.close((err) => (err ? rejectClose(err) : resolveClose()));
        });
      }
    });
  });
});
