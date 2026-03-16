import { redirect } from "next/navigation";

import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const access = await getDroneOpsAccess();

  if (access.isAuthenticated) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-layout">
      <section className="auth-side stack-sm">
        <p className="eyebrow">Aerial Operations OS</p>
        <h2>Secure mission planning, processing, and delivery for field teams</h2>
        <p className="muted">
          Sign in to access your organization workspace, entitlement status, and
          the new mission-control shell for planning, ingest, and processing.
        </p>

        <ul className="auth-trust-list stack-xs">
          <li>Email/password authentication via Supabase</li>
          <li>Role-aware access using organization membership</li>
          <li>Entitlement checks for product_id=&quot;drone-ops&quot;</li>
        </ul>
      </section>

      <section>
        <SignInForm />
      </section>
    </main>
  );
}
