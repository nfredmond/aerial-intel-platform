"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getFriendlySignInError } from "@/lib/auth/sign-in-errors";
import { createSupportMailto } from "@/lib/support";
import { createClientSupabaseClient } from "@/lib/supabase/client";

type AuthClient = {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<{
      error: {
        message?: string;
        code?: string;
      } | null;
    }>;
  };
};

type SignInFormProps = {
  createClient?: () => AuthClient;
};

export function SignInForm({
  createClient = createClientSupabaseClient,
}: SignInFormProps) {
  const supabase = useMemo(() => createClient(), [createClient]);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recoveryHref = createSupportMailto({
    subject: "DroneOps sign-in support",
    body: "Hello support team,\n\nI need help signing in to DroneOps.",
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(getFriendlySignInError(error));
        setIsSubmitting(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage(getFriendlySignInError(null));
      setIsSubmitting(false);
    }
  }

  return (
    <form className="surface auth-form stack-sm" onSubmit={onSubmit} aria-busy={isSubmitting}>
      <p className="eyebrow">Account access</p>
      <h1>Sign in to DroneOps</h1>
      <p className="muted">Use your licensed account credentials to continue.</p>

      <fieldset className="form-fieldset stack-sm" disabled={isSubmitting}>
        <div className="field-group stack-xs">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="field-group stack-xs">
          <div className="field-label-row">
            <label htmlFor="password">Password</label>
            <button
              className="button-inline"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      </fieldset>

      {errorMessage ? (
        <p className="callout callout-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button className="button button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in securely…" : "Sign in"}
      </button>

      <p className="muted helper-copy">
        Forgot your password or still blocked?{" "}
        <a href={recoveryHref}>Contact support</a> with your organization name.
      </p>
    </form>
  );
}
