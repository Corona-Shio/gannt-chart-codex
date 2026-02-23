import { NextResponse } from "next/server";

import { releaseDateCreateSchema, releaseDateDeleteSchema, releaseDatePatchSchema } from "@/lib/api";
import { canEdit, getWorkspaceRole, requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ReleaseDateRow } from "@/types/domain";

type ReleaseDateJoinRow = {
  id: string;
  workspace_id: string;
  channel_id: string;
  script_id: string;
  release_date: string;
  label: string | null;
  channels: { name: string } | { name: string }[] | null;
  scripts: { script_no: string } | { script_no: string }[] | null;
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

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("scripts")
    .insert({
      workspace_id: workspaceId,
      script_no: scriptNo,
      title: scriptTitle ?? null
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create script");
  }

  return data.id;
}

function mapRows(rows: ReleaseDateJoinRow[]): ReleaseDateRow[] {
  return rows.map((row) => {
    const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels;
    const script = Array.isArray(row.scripts) ? row.scripts[0] : row.scripts;

    return {
      id: row.id,
      workspace_id: row.workspace_id,
      channel_id: row.channel_id,
      script_id: row.script_id,
      release_date: row.release_date,
      label: row.label,
      channel_name: channel?.name ?? "",
      script_no: script?.script_no ?? ""
    };
  });
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
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
    .from("release_dates")
    .select("id, workspace_id, channel_id, script_id, release_date, label, channels(name), scripts(script_no)")
    .eq("workspace_id", workspaceId)
    .order("release_date", { ascending: true });

  if (rangeStart) {
    query = query.gte("release_date", rangeStart);
  }
  if (rangeEnd) {
    query = query.lte("release_date", rangeEnd);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: mapRows((data ?? []) as ReleaseDateJoinRow[]) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const json = await request.json();
  const parsed = releaseDateCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let scriptId: string;
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

  const { data, error } = await auth.supabase
    .from("release_dates")
    .upsert(
      {
        workspace_id: payload.workspaceId,
        channel_id: payload.channelId,
        script_id: scriptId,
        release_date: payload.releaseDate,
        label: payload.label ?? null,
        created_by: auth.user.id,
        updated_by: auth.user.id
      },
      { onConflict: "workspace_id,channel_id,script_id" }
    )
    .select("id, workspace_id, channel_id, script_id, release_date, label, channels(name), scripts(script_no)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to save release date" }, { status: 500 });
  }

  return NextResponse.json({ data: mapRows([data as ReleaseDateJoinRow])[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const json = await request.json();
  const parsed = releaseDatePatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {
    updated_by: auth.user.id
  };
  if (payload.releaseDate !== undefined) patch.release_date = payload.releaseDate;
  if (payload.label !== undefined) patch.label = payload.label;

  const { data, error } = await auth.supabase
    .from("release_dates")
    .update(patch)
    .eq("id", payload.id)
    .eq("workspace_id", payload.workspaceId)
    .select("id, workspace_id, channel_id, script_id, release_date, label, channels(name), scripts(script_no)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to update release date" }, { status: 500 });
  }

  return NextResponse.json({ data: mapRows([data as ReleaseDateJoinRow])[0] });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (auth.error) {
    return auth.error;
  }

  const json = await request.json();
  const parsed = releaseDateDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const role = await getWorkspaceRole(auth.supabase, payload.workspaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await auth.supabase
    .from("release_dates")
    .delete()
    .eq("id", payload.id)
    .eq("workspace_id", payload.workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
