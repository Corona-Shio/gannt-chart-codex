import { NextResponse } from "next/server";

import { taskPatchSchema } from "@/lib/api";
import { canEdit, getWorkspaceRole, requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { TaskRow } from "@/types/domain";

type TaskJoinRow = {
  id: string;
  workspace_id: string;
  channel_id: string;
  script_id: string | null;
  task_type_id: string;
  status_id: string;
  assignee_id: string | null;
  task_name: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  channels: { name: string } | { name: string }[] | null;
  scripts: { script_no: string; title: string | null } | { script_no: string; title: string | null }[] | null;
  task_types: { name: string } | { name: string }[] | null;
  task_statuses: { name: string } | { name: string }[] | null;
  assignees: { display_name: string } | { display_name: string }[] | null;
};

function mapTaskRow(row: TaskJoinRow): TaskRow {
  const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
  const script = Array.isArray(row.scripts) ? row.scripts[0] : row.scripts;
  const taskType = Array.isArray(row.task_types) ? row.task_types[0] : row.task_types;
  const status = Array.isArray(row.task_statuses) ? row.task_statuses[0] : row.task_statuses;
  const assignee = Array.isArray(row.assignees) ? row.assignees[0] : row.assignees;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    channel_id: row.channel_id,
    script_id: row.script_id,
    task_type_id: row.task_type_id,
    status_id: row.status_id,
    assignee_id: row.assignee_id,
    task_name: row.task_name,
    start_date: row.start_date,
    end_date: row.end_date,
    notes: row.notes,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    channel_name: channel?.name ?? "",
    script_no: script?.script_no ?? "",
    script_title: script?.title ?? null,
    task_type_name: taskType?.name ?? "",
    status_name: status?.name ?? "",
    assignee_name: assignee?.display_name ?? null
  };
}

async function resolveScriptId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  workspaceId: string,
  scriptNo: string,
  scriptTitle?: string
) {
  const normalizedScriptNo = scriptNo.trim();
  const { data: existing } = await supabase
    .from("scripts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("script_no", normalizedScriptNo)
    .single();

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("scripts")
    .insert({
      workspace_id: workspaceId,
      script_no: normalizedScriptNo,
      title: scriptTitle ?? null
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create script");
  }

  return data.id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;
  const json = await request.json();
  const parsed = taskPatchSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await auth.supabase
    .from("tasks")
    .select("id, start_date, end_date")
    .eq("id", id)
    .eq("workspace_id", payload.workspaceId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const nextStart = payload.startDate ?? existing.start_date;
  const nextEnd = payload.endDate ?? existing.end_date;
  if (nextStart > nextEnd) {
    return NextResponse.json({ error: "startDate must be <= endDate" }, { status: 400 });
  }

  let resolvedScriptId: string | null | undefined = payload.scriptId;
  if (!resolvedScriptId && payload.scriptNo !== undefined) {
    const normalizedScriptNo = payload.scriptNo.trim();
    if (!normalizedScriptNo) {
      resolvedScriptId = null;
    } else {
      try {
        resolvedScriptId = await resolveScriptId(auth.supabase, payload.workspaceId, normalizedScriptNo, payload.scriptTitle);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to resolve script" }, { status: 500 });
      }
    }
  }

  const updatePayload: Record<string, unknown> = {
    updated_by: auth.user.id
  };

  if (payload.channelId) updatePayload.channel_id = payload.channelId;
  if (payload.scriptId !== undefined || payload.scriptNo !== undefined) updatePayload.script_id = resolvedScriptId ?? null;
  if (payload.taskTypeId) updatePayload.task_type_id = payload.taskTypeId;
  if (payload.statusId) updatePayload.status_id = payload.statusId;
  if (payload.assigneeId !== undefined) updatePayload.assignee_id = payload.assigneeId;
  if (payload.taskName !== undefined) updatePayload.task_name = payload.taskName;
  if (payload.startDate !== undefined) updatePayload.start_date = payload.startDate;
  if (payload.endDate !== undefined) updatePayload.end_date = payload.endDate;
  if (payload.notes !== undefined) updatePayload.notes = payload.notes;

  const { data, error } = await auth.supabase
    .from("tasks")
    .update(updatePayload)
    .eq("id", id)
    .eq("workspace_id", payload.workspaceId)
    .select(
      `id, workspace_id, channel_id, script_id, task_type_id, status_id, assignee_id, task_name, start_date, end_date, notes, created_by, updated_by, created_at, updated_at,
      channels(name),
      scripts(script_no, title),
      task_types(name),
      task_statuses(name),
      assignees(display_name)`
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to update task" }, { status: 500 });
  }

  return NextResponse.json({ data: mapTaskRow(data as TaskJoinRow) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const role = await getWorkspaceRole(auth.supabase, workspaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await auth.supabase.from("tasks").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
