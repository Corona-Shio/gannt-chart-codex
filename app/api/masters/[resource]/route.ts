import { NextResponse } from "next/server";

import { masterCreateSchema, masterPatchSchema } from "@/lib/api";
import { getWorkspaceRole, isAdmin, requireUser } from "@/lib/auth";

const resourceMap = {
  channels: {
    table: "channels",
    select: "id, workspace_id, name, sort_order, is_active",
    orderBy: "sort_order"
  },
  task_types: {
    table: "task_types",
    select: "id, workspace_id, name, sort_order, is_active",
    orderBy: "sort_order"
  },
  task_statuses: {
    table: "task_statuses",
    select: "id, workspace_id, name, sort_order, is_done",
    orderBy: "sort_order"
  },
  assignees: {
    table: "assignees",
    select: "id, workspace_id, display_name, is_active",
    orderBy: "display_name"
  }
} as const;

type ResourceName = keyof typeof resourceMap;

function parseResource(value: string): ResourceName | null {
  return value in resourceMap ? (value as ResourceName) : null;
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { resource } = await context.params;
  const target = parseResource(resource);
  if (!target) {
    return NextResponse.json({ error: "Unsupported resource" }, { status: 404 });
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

  const config = resourceMap[target];

  const { data, error } = await auth.supabase
    .from(config.table)
    .select(config.select)
    .eq("workspace_id", workspaceId)
    .order(config.orderBy, { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { resource } = await context.params;
  const target = parseResource(resource);
  if (!target) {
    return NextResponse.json({ error: "Unsupported resource" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = masterCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (target === "assignees") {
    const { data, error } = await auth.supabase
      .from("assignees")
      .insert({
        workspace_id: payload.workspaceId,
        display_name: payload.name,
        is_active: payload.isActive ?? true
      })
      .select("id, workspace_id, display_name, is_active")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  }

  if (target === "task_statuses") {
    const { data, error } = await auth.supabase
      .from("task_statuses")
      .insert({
        workspace_id: payload.workspaceId,
        name: payload.name,
        sort_order: payload.sortOrder ?? 999,
        is_done: payload.isDone ?? false
      })
      .select("id, workspace_id, name, sort_order, is_done")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  }

  const table = target === "channels" ? "channels" : "task_types";
  const { data, error } = await auth.supabase
    .from(table)
    .insert({
      workspace_id: payload.workspaceId,
      name: payload.name,
      sort_order: payload.sortOrder ?? 999,
      is_active: payload.isActive ?? true
    })
    .select("id, workspace_id, name, sort_order, is_active")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string }> }) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { resource } = await context.params;
  const target = parseResource(resource);
  if (!target) {
    return NextResponse.json({ error: "Unsupported resource" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = masterPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (target === "assignees") {
    const patch: Record<string, unknown> = {};
    if (payload.name !== undefined) patch.display_name = payload.name;
    if (payload.isActive !== undefined) patch.is_active = payload.isActive;

    const { data, error } = await auth.supabase
      .from("assignees")
      .update(patch)
      .eq("id", payload.id)
      .eq("workspace_id", payload.workspaceId)
      .select("id, workspace_id, display_name, is_active")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  if (target === "task_statuses") {
    const patch: Record<string, unknown> = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.sortOrder !== undefined) patch.sort_order = payload.sortOrder;
    if (payload.isDone !== undefined) patch.is_done = payload.isDone;

    const { data, error } = await auth.supabase
      .from("task_statuses")
      .update(patch)
      .eq("id", payload.id)
      .eq("workspace_id", payload.workspaceId)
      .select("id, workspace_id, name, sort_order, is_done")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name;
  if (payload.sortOrder !== undefined) patch.sort_order = payload.sortOrder;
  if (payload.isActive !== undefined) patch.is_active = payload.isActive;

  const table = target === "channels" ? "channels" : "task_types";
  const { data, error } = await auth.supabase
    .from(table)
    .update(patch)
    .eq("id", payload.id)
    .eq("workspace_id", payload.workspaceId)
    .select("id, workspace_id, name, sort_order, is_active")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
