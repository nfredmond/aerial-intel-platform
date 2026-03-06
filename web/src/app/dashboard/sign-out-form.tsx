import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type SignOutFormProps = {
  label?: string;
  variant?: "primary" | "secondary";
};

export function SignOutForm({
  label = "Sign out",
  variant = "primary",
}: SignOutFormProps) {
  async function signOut() {
    "use server";

    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    redirect("/sign-in");
  }

  return (
    <form action={signOut}>
      <button
        className={`button ${variant === "secondary" ? "button-secondary" : "button-primary"}`}
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}
