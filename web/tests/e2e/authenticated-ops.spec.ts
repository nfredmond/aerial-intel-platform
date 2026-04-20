import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

type SmokeConfig = {
  baseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  ownerEmail: string;
  ownerUserId: string;
  orgId: string;
  rasterArtifactId: string;
  secondArtifactId: string;
  syntheticJobId: string;
  expectRaster: boolean;
};

type SmokeComment = {
  id: string;
  artifact_id: string;
  resolved_at: string | null;
};

const shouldRun = process.env.AERIAL_E2E_AUTH_SMOKE === "1";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}; authenticated smoke tests are opt-in and require explicit test env.`);
  }
  return value;
}

function readConfig(): SmokeConfig {
  return {
    baseUrl: process.env.AERIAL_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    ownerEmail: requireEnv("AERIAL_E2E_OWNER_EMAIL"),
    ownerUserId: requireEnv("AERIAL_E2E_OWNER_USER_ID"),
    orgId: requireEnv("AERIAL_E2E_ORG_ID"),
    rasterArtifactId: requireEnv("AERIAL_E2E_RASTER_ARTIFACT_ID"),
    secondArtifactId: requireEnv("AERIAL_E2E_SECOND_ARTIFACT_ID"),
    syntheticJobId: requireEnv("AERIAL_E2E_SYNTHETIC_JOB_ID"),
    expectRaster: process.env.AERIAL_E2E_EXPECT_RASTER === "1",
  };
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCookieChunks(
  key: string,
  value: string,
  chunkSize = 3180,
): Array<{ name: string; value: string }> {
  const encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) return [{ name: key, value }];

  const chunks: string[] = [];
  let remaining = encodedValue;

  while (remaining.length > 0) {
    let encodedHead = remaining.slice(0, chunkSize);
    const lastEscapePos = encodedHead.lastIndexOf("%");
    if (lastEscapePos > chunkSize - 3) {
      encodedHead = encodedHead.slice(0, lastEscapePos);
    }

    let decodedHead = "";
    while (encodedHead.length > 0) {
      try {
        decodedHead = decodeURIComponent(encodedHead);
        break;
      } catch (error) {
        if (
          error instanceof URIError &&
          encodedHead.at(-3) === "%" &&
          encodedHead.length > 3
        ) {
          encodedHead = encodedHead.slice(0, encodedHead.length - 3);
        } else {
          throw error;
        }
      }
    }

    chunks.push(decodedHead);
    remaining = remaining.slice(encodedHead.length);
  }

  return chunks.map((value, index) => ({ name: `${key}.${index}`, value }));
}

function authCookiesForSession(config: SmokeConfig, session: Session) {
  const projectRef = new URL(config.supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const encodedSession = `base64-${base64url(JSON.stringify(session))}`;
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60;

  return createCookieChunks(storageKey, encodedSession).map(({ name, value }) => ({
    name,
    value,
    url: config.baseUrl,
    expires,
    sameSite: "Lax" as const,
    httpOnly: false,
    secure: config.baseUrl.startsWith("https://"),
  }));
}

async function createOwnerSession(config: SmokeConfig, anon: SupabaseClient, admin: SupabaseClient) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: config.ownerEmail,
  });
  expect(linkError).toBeNull();

  const tokenHash = link.properties?.hashed_token;
  expect(tokenHash).toBeTruthy();

  const { data, error } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  expect(error).toBeNull();
  expect(data.session).toBeTruthy();

  return data.session as Session;
}

async function createAuthedContext(browser: Browser, config: SmokeConfig, session: Session) {
  const context = await browser.newContext();
  await context.addCookies(authCookiesForSession(config, session));
  return context;
}

async function directRestCount(
  config: SmokeConfig,
  table: string,
  accessToken: string,
  select = "id",
) {
  const url = `${config.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=2`;
  const response = await fetch(url, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  expect(response.ok).toBeTruthy();

  const body = (await response.json()) as unknown[];
  return body.length;
}

async function cleanupSmokeData(
  admin: SupabaseClient,
  input: { commentIds?: string[]; tempUserId?: string | null },
) {
  const commentIds = input.commentIds?.filter(Boolean) ?? [];
  if (commentIds.length > 0) {
    await admin.from("drone_artifact_comments").delete().in("id", commentIds);
  }
  if (input.tempUserId) {
    await admin
      .from("drone_memberships")
      .delete()
      .eq("user_id", input.tempUserId);
    await admin.auth.admin.deleteUser(input.tempUserId);
  }
}

test.describe("authenticated operational smoke", () => {
  test.skip(!shouldRun, "Set AERIAL_E2E_AUTH_SMOKE=1 with explicit Supabase smoke env to run.");
  test.setTimeout(180_000);

  test("validates RLS suspension, comment scoping, copilot citations, and raster delivery", async ({
    browser,
  }) => {
    const config = readConfig();
    const anon = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const commentIds: string[] = [];
    let tempUserId: string | null = null;
    let ownerContext: BrowserContext | null = null;

    try {
      const ownerSession = await createOwnerSession(config, anon, admin);
      await expect
        .poll(() => directRestCount(config, "drone_missions", ownerSession.access_token), {
          message: "active owner should read tenant missions through RLS",
        })
        .toBeGreaterThan(0);
      await expect
        .poll(
          () => directRestCount(config, "drone_processing_outputs", ownerSession.access_token),
          {
            message: "active owner should read tenant outputs through RLS",
          },
        )
        .toBeGreaterThan(0);

      const tempEmail = `codex-suspended-${Date.now()}@natfordplanning.test`;
      const tempPassword = `Codex-${Date.now()}-Smoke1!`;
      const { data: tempUser, error: createUserError } =
        await admin.auth.admin.createUser({
          email: tempEmail,
          password: tempPassword,
          email_confirm: true,
        });
      expect(createUserError).toBeNull();
      tempUserId = tempUser.user?.id ?? null;
      expect(tempUserId).toBeTruthy();

      const { error: membershipError } = await admin.from("drone_memberships").insert({
        org_id: config.orgId,
        user_id: tempUserId,
        role: "analyst",
        status: "suspended",
      });
      expect(membershipError).toBeNull();

      const { data: suspendedAuth, error: signInError } =
        await anon.auth.signInWithPassword({
          email: tempEmail,
          password: tempPassword,
        });
      expect(signInError).toBeNull();
      expect(suspendedAuth.session).toBeTruthy();

      await expect
        .poll(() =>
          directRestCount(
            config,
            "drone_missions",
            (suspendedAuth.session as Session).access_token,
          ),
        )
        .toBe(0);
      await expect
        .poll(() =>
          directRestCount(
            config,
            "drone_processing_outputs",
            (suspendedAuth.session as Session).access_token,
          ),
        )
        .toBe(0);

      const suspendedContext = await createAuthedContext(
        browser,
        config,
        suspendedAuth.session as Session,
      );
      const suspendedPage = await suspendedContext.newPage();
      await suspendedPage.goto("/dashboard", { waitUntil: "networkidle" });
      await expect(
        suspendedPage.getByRole("status").filter({
          hasText: /No organization membership|does not currently have/i,
        }),
      ).toBeVisible();
      await suspendedContext.close();

      ownerContext = await createAuthedContext(browser, config, ownerSession);
      const page = await ownerContext.newPage();
      const consoleMessages: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        if (
          ["error", "warning"].includes(message.type()) &&
          !text.includes("GL Driver Message") &&
          !text.includes("Failed to load resource: the server responded with a status of 404") &&
          !(
            text.includes("/cog/tiles/WebMercatorQuad/") &&
            text.includes("AJAXError: Failed to fetch")
          )
        ) {
          consoleMessages.push(`${message.type()}: ${text}`);
        }
      });

      await page.goto("/dashboard", { waitUntil: "networkidle" });
      await expect(page.getByText("Nat Ford Drone Lab")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /access is currently blocked/i }),
      ).toHaveCount(0);

      const firstCommentBody = `codex smoke current artifact ${Date.now()}`;
      const secondCommentBody = `codex smoke cross artifact ${Date.now()}`;
      const { data: insertedComments, error: insertCommentsError } = await admin
        .from("drone_artifact_comments")
        .insert([
          {
            org_id: config.orgId,
            artifact_id: config.rasterArtifactId,
            author_user_id: config.ownerUserId,
            author_email: config.ownerEmail,
            body: firstCommentBody,
          },
          {
            org_id: config.orgId,
            artifact_id: config.secondArtifactId,
            author_user_id: config.ownerUserId,
            author_email: config.ownerEmail,
            body: secondCommentBody,
          },
        ])
        .select("id, artifact_id, resolved_at");
      expect(insertCommentsError).toBeNull();

      const firstComment = ((insertedComments ?? []) as SmokeComment[]).find(
        (comment) => comment.artifact_id === config.rasterArtifactId,
      );
      const secondComment = ((insertedComments ?? []) as SmokeComment[]).find(
        (comment) => comment.artifact_id === config.secondArtifactId,
      );
      expect(firstComment).toBeTruthy();
      expect(secondComment).toBeTruthy();
      commentIds.push(firstComment!.id, secondComment!.id);

      await page.goto(`/artifacts/${config.rasterArtifactId}`, {
        waitUntil: "networkidle",
      });
      await expect(page.getByText(firstCommentBody)).toBeVisible();

      const firstArticle = page.locator("article", { hasText: firstCommentBody }).first();
      await firstArticle.locator('input[name="commentId"]').evaluate(
        (input, replacementId) => {
          (input as HTMLInputElement).value = replacementId;
        },
        secondComment!.id,
      );
      await Promise.all([
        page.waitForURL(/action=error/),
        firstArticle.getByRole("button", { name: "Mark resolved" }).click(),
      ]);

      const { data: secondAfterTamper, error: tamperCheckError } = await admin
        .from("drone_artifact_comments")
        .select("resolved_at")
        .eq("id", secondComment!.id)
        .single();
      expect(tamperCheckError).toBeNull();
      expect(secondAfterTamper.resolved_at).toBeNull();

      await page.goto(`/artifacts/${config.rasterArtifactId}`, {
        waitUntil: "networkidle",
      });
      const realArticle = page.locator("article", { hasText: firstCommentBody }).first();
      await Promise.all([
        page.waitForURL(/action=comment-resolved/),
        realArticle.getByRole("button", { name: "Mark resolved" }).click(),
      ]);

      const { data: firstAfterResolve, error: resolveCheckError } = await admin
        .from("drone_artifact_comments")
        .select("resolved_at")
        .eq("id", firstComment!.id)
        .single();
      expect(resolveCheckError).toBeNull();
      expect(firstAfterResolve.resolved_at).toBeTruthy();

      if (config.expectRaster) {
        const tileStatuses: number[] = [];
        page.on("response", (response) => {
          if (response.url().includes("/cog/tiles/WebMercatorQuad/")) {
            tileStatuses.push(response.status());
          }
        });

        await page.goto(`/artifacts/${config.rasterArtifactId}`, {
          waitUntil: "networkidle",
        });
        await expect(page.getByRole("heading", { name: /orthomosaic overlay/i })).toBeVisible();
        await expect(page.getByText(/Viewer not configured/i)).toHaveCount(0);
        await expect(page.getByLabel(/raster preview/i)).toBeVisible();
        await expect(page.getByLabel(/Overlay opacity/i)).toBeVisible();
        await expect
          .poll(() => tileStatuses.some((status) => status === 200), {
            message: "raster viewer should load at least one TiTiler tile",
            timeout: 30_000,
          })
          .toBeTruthy();
      }

      await page.goto(`/jobs/${config.syntheticJobId}`, { waitUntil: "networkidle" });
      const copilotPanel = page
        .locator("section", { hasText: "Aerial Copilot — Processing QA" })
        .first();
      await expect(copilotPanel).toBeVisible();
      await copilotPanel.getByRole("button", { name: "Ask Aerial Copilot" }).click();
      await expect(copilotPanel.getByText(/\[fact:/)).toBeVisible({ timeout: 120_000 });
      await expect(copilotPanel.getByText(/\d+\/\d+ sentences kept/)).toBeVisible();

      expect(consoleMessages).toEqual([]);
    } finally {
      if (ownerContext) await ownerContext.close();
      await cleanupSmokeData(admin, { commentIds, tempUserId });
    }
  });
});
