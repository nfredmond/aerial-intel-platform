import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export function SignOutForm() {
  async function signOut() {
    "use server";

    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    redirect("/sign-in");
  }

  return (
    <form action={signOut}>
      <button type="submit">Sign out</button>
    </form>
  );
}
