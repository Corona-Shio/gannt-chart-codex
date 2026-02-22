import { NextResponse } from "next/server";

import { taskCreateSchema, parseCsvParam } from "@/lib/api";
import { canEdit, getWorkspaceRole, requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SortBy, TaskRow } from "@/types/domain";

type TaskJoinRow = {
  id: string;
  workspace_id: string;
  channel_id: string;
  script_id: string;
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

async function ensureScriptId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  workspaceId: string,
  scriptId: string | undefined,
  scriptNo: string | undefined,
  scriptTitle: string | undefined
): Promise<string> {
  if (scriptId) {
    return scriptId;
  }
  if (!scriptNo) {
    throw new Error("scriptNo is required");
  }

  const { data: existing } = await supabase
    .from("scripts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("script_no", scriptNo)
    .single();

  if (existing) {
    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from("scripts")
    .insert({
      workspace_id: workspaceId,
      script_no: scriptNo,
      title: scriptTitle ?? null
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to create script");
  }

  return inserted.id;
}

function mapTaskRows(rows: TaskJoinRow[]): TaskRow[] {
  return rows.map((row) => {
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
  });
}

function sortTasks(rows: TaskRow[], sortBy: SortBy): TaskRow[] {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    if (sortBy === "script_no_asc") {
      return a.script_no.localeCompare(b.script_no, "ja", { numeric: true });
    }
    if (sortBy === "script_no_desc") {
      return b.script_no.localeCompare(a.script_no, "ja", { numeric: true });
    }
    if (sortBy === "start_date_asc") {
      return a.start_date.localeCompare(b.start_date);
    }
    return b.start_date.localeCompare(a.start_date);
  });

  return sorted;
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const sortBy = (searchParams.get("sortBy") as SortBy | null) ?? "script_no_asc";
  const channelIds = parseCsvParam(searchParams.get("channelIds"));
  const assigneeIds = parseCsvParam(searchParams.get("assigneeIds"));
  const statusIds = parseCsvParam(searchParams.get("statusIds"));
  const taskTypeIds = parseCsvParam(searchParams.get("taskTypeIds"));
  const rangeStart = searchParams.get("rangeStart");
  const rangeEnd = searchParams.get("rangeEnd");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const role = await getWorkspaceRole(auth.supabase, workspaceId);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = auth.supabase
    .from("tasks")
    .select(
      `id, workspace_id, channel_id, script_id, task_type_id, status_id, assignee_id, task_name, start_date, end_date, notes, created_by, updated_by, created_at, updated_at,
      channels(name),
      scripts(script_no, title),
      task_types(name),
      task_statuses(name),
      assignees(display_name)`
    )
    .eq("workspace_id", workspaceId);

  if (channelIds?.length) {
    query = query.in("channel_id", channelIds);
  }
  if (assigneeIds?.length) {
    query = query.in("assignee_id", assigneeIds);
  }
  if (statusIds?.length) {
    query = query.in("status_id", statusIds);
  }
  if (taskTypeIds?.length) {
    query = query.in("task_type_id", taskTypeIds);
  }
  if (rangeStart) {
    query = query.gte("end_date", rangeStart);
  }
  if (rangeEnd) {
    query = query.lte("start_date", rangeEnd);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = mapTaskRows((data ?? []) as TaskJoinRow[]);
  const sorted = sortTasks(rows, sortBy);

  return NextResponse.json({ data: sorted });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const json = await request.json();
  const parsed = taskCreateSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let scriptId = payload.scriptId;
  try {
    scriptId = await ensureScriptId(
      auth.supabase,
      payload.workspaceId,
      payload.scriptId,
      payload.scriptNo,
      payload.scriptTitle
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to resolve script" }, { status: 500 });
  }

  let statusId = payload.statusId;
  if (!statusId) {
    const { data: status } = await auth.supabase
      .from("task_statuses")
      .select("id")
      .eq("workspace_id", payload.workspaceId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    statusId = status?.id;
  }

  if (!statusId) {
    return NextResponse.json({ error: "No task status available" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("tasks")
    .insert({
      workspace_id: payload.workspaceId,
      channel_id: payload.channelId,
      script_id: scriptId,
      task_type_id: payload.taskTypeId,
      status_id: statusId,
      assignee_id: payload.assigneeId ?? null,
      task_name: payload.taskName,
      start_date: payload.startDate,
      end_date: payload.endDate,
      notes: payload.notes ?? null,
      created_by: auth.user.id,
      updated_by: auth.user.id
    })
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
    return NextResponse.json({ error: error?.message ?? "Failed to create task" }, { status: 500 });
  }

  const row = mapTaskRows([data as TaskJoinRow])[0];
  return NextResponse.json({ data: row }, { status: 201 });
}
