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
    <main className="page-shell center-screen">
      <SignInForm />
    </main>
  );
}
