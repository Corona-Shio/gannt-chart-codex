"use client";

import { createClientSupabase } from "@/lib/supabase/client";

export function SignOutButton() {
  const onSignOut = async () => {
    const supabase = createClientSupabase();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <button type="button" onClick={onSignOut}>
      Sign out
    </button>
  );
}
