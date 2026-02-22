import { NextResponse } from "next/server";
import { z } from "zod";

import { getWorkspaceRole, isAdmin, requireUser } from "@/lib/auth";

const patchSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"])
});

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const role = await getWorkspaceRole(auth.supabase, workspaceId);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: target, error: targetError } = await auth.supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", payload.workspaceId)
    .eq("user_id", payload.userId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("workspace_members")
    .update({ role: payload.role })
    .eq("workspace_id", payload.workspaceId)
    .eq("user_id", payload.userId)
    .select("workspace_id, user_id, role, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to update role" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
