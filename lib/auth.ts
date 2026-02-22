import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/types/domain";

export async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, supabase };
}

export async function getWorkspaceRole(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  workspaceId: string
) {
  const {
    data: member,
    error
  } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !member) {
    return null;
  }

  return member.role as WorkspaceRole;
}

export function canEdit(role: WorkspaceRole | null): boolean {
  return role === "admin" || role === "editor";
}

export function isAdmin(role: WorkspaceRole | null): boolean {
  return role === "admin";
}
