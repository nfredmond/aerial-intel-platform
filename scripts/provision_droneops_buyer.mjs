#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const ROLES = new Set(["owner", "admin", "analyst", "viewer"]);

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function usage() {
  console.log(`\nProvision a DroneOps buyer in Supabase\n\nUsage:\n  node scripts/provision_droneops_buyer.mjs --email buyer@example.com [options]\n\nRequired:\n  --email <value>\n\nOptional:\n  --password <value>      Password for new user (generated if omitted)\n  --org-name <value>      Organization display name\n  --org-slug <value>      Organization slug (generated from org-name/email)\n  --role <value>          owner|admin|analyst|viewer (default: owner)\n  --tier <value>          Entitlement tier id (default: starter)\n\nEnvironment variables:\n  SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n`);
}

function normalizeSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function createSupabaseClient({ supabaseUrl, serviceRoleKey }) {
  async function request(path, { method = "GET", body, headers } = {}) {
    const response = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await safeJson(response);

    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? String(data.message)
          : `Request failed (${response.status})`;

      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  async function listAllUsersByEmail(email) {
    let page = 1;

    while (true) {
      const result = await request(`/auth/v1/admin/users?page=${page}&per_page=200`);
      const users = Array.isArray(result?.users) ? result.users : [];

      const match = users.find(
        (candidate) =>
          String(candidate?.email ?? "").toLowerCase() === email.toLowerCase(),
      );

      if (match) {
        return match;
      }

      if (users.length < 200) {
        return null;
      }

      page += 1;
    }
  }

  async function upsertOne(table, conflictColumns, row) {
    const encodedConflict = encodeURIComponent(conflictColumns.join(","));
    const data = await request(
      `/rest/v1/${table}?on_conflict=${encodedConflict}&select=*`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: row,
      },
    );

    if (!Array.isArray(data) || !data[0]) {
      throw new Error(`Upsert for ${table} returned no rows`);
    }

    return data[0];
  }

  return {
    request,
    listAllUsersByEmail,
    upsertOne,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true") {
    usage();
    process.exit(0);
  }

  const email = args.email?.trim().toLowerCase();
  if (!email) {
    usage();
    throw new Error("--email is required");
  }

  const role = (args.role ?? "owner").toLowerCase();
  if (!ROLES.has(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const tier = args.tier ?? "starter";

  const generatedPassword = `DroneOps!${randomBytes(8).toString("hex")}`;
  const password = args.password ?? generatedPassword;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }

  const client = createSupabaseClient({ supabaseUrl, serviceRoleKey });

  let user = await client.listAllUsersByEmail(email);
  let createdUser = false;

  if (!user) {
    const createResult = await client.request("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email,
        password,
        email_confirm: true,
      },
    });

    user = createResult?.user ?? createResult;
    createdUser = true;
  }

  if (!user?.id) {
    throw new Error("Unable to resolve auth user id");
  }

  const derivedOrgName = args["org-name"] ?? `${email.split("@")[0]} org`;
  const orgName = derivedOrgName.trim();
  const orgSlug =
    args["org-slug"] ?? (normalizeSlug(orgName) || normalizeSlug(email.split("@")[0]));

  const org = await client.upsertOne("drone_orgs", ["slug"], {
    name: orgName,
    slug: orgSlug,
  });

  const membership = await client.upsertOne(
    "drone_memberships",
    ["org_id", "user_id"],
    {
      org_id: org.id,
      user_id: user.id,
      role,
    },
  );

  const entitlement = await client.upsertOne(
    "drone_entitlements",
    ["org_id", "product_id"],
    {
      org_id: org.id,
      product_id: "drone-ops",
      tier_id: tier,
      status: "active",
      source: "manual_provisioning",
      external_reference: `provision:${new Date().toISOString()}`,
    },
  );

  console.log("\n✅ DroneOps provisioning complete\n");
  console.log(JSON.stringify(
    {
      user: {
        id: user.id,
        email: user.email,
        created: createdUser,
        password: createdUser ? password : "(existing user; unchanged)",
      },
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      membership: {
        org_id: membership.org_id,
        user_id: membership.user_id,
        role: membership.role,
      },
      entitlement: {
        id: entitlement.id,
        org_id: entitlement.org_id,
        product_id: entitlement.product_id,
        tier_id: entitlement.tier_id,
        status: entitlement.status,
      },
    },
    null,
    2,
  ));
}

main().catch((error) => {
  console.error("\n❌ Provisioning failed");
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
