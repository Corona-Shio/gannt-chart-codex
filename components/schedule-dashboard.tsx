"use client";

import {
  addDays,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
  subDays,
  addMonths
} from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson } from "@/lib/http";
import { dateRange } from "@/lib/date";
import { createClientSupabase } from "@/lib/supabase/client";
import type {
  Assignee,
  Channel,
  ReleaseDateRow,
  SortBy,
  TaskRow,
  TaskStatus,
  TaskType,
  WorkspaceMember,
  WorkspaceRole
} from "@/types/domain";

const DAY_WIDTH = 30;
const LEFT_WIDTH = 700;

type GroupBy = "channel" | "none";

type Filters = {
  channelId: string;
  assigneeId: string;
  statusId: string;
  taskTypeId: string;
};

type CreateDraft = {
  channelId: string;
  startDate: string;
  endDate: string;
};

type CreateTaskForm = {
  channelId: string;
  scriptNo: string;
  scriptTitle: string;
  taskTypeId: string;
  statusId: string;
  assigneeId: string;
  taskName: string;
  startDate: string;
  endDate: string;
  notes: string;
};

type ReleaseForm = {
  channelId: string;
  scriptNo: string;
  scriptTitle: string;
  releaseDate: string;
  label: string;
};

type MasterState = {
  channels: Channel[];
  taskTypes: TaskType[];
  taskStatuses: TaskStatus[];
  assignees: Assignee[];
};

type BarInteraction = {
  taskId: string;
  type: "move" | "resize-start" | "resize-end";
  pointerId: number;
  baseStart: string;
  baseEnd: string;
  offsetDays: number;
};

type LaneInteraction = {
  channelId: string;
  pointerId: number;
  anchorIndex: number;
  currentIndex: number;
};

const emptyMasters: MasterState = {
  channels: [],
  taskTypes: [],
  taskStatuses: [],
  assignees: []
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fmtDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function today() {
  return fmtDate(new Date());
}

function toDateLabel(dateString: string) {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? format(parsed, "M/d") : dateString;
}

export function ScheduleDashboard({
  workspaceId,
  workspaceName,
  role,
  userEmail
}: {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  userEmail: string;
}) {
  const now = useMemo(() => new Date(), []);
  const [rangeStart, setRangeStart] = useState(fmtDate(subDays(startOfMonth(addMonths(now, -1)), 0)));
  const [rangeEnd, setRangeEnd] = useState(fmtDate(addDays(endOfMonth(addMonths(now, 1)), 0)));

  const [groupBy, setGroupBy] = useState<GroupBy>("channel");
  const [sortBy, setSortBy] = useState<SortBy>("script_no_asc");
  const [filters, setFilters] = useState<Filters>({
    channelId: "all",
    assigneeId: "all",
    statusId: "all",
    taskTypeId: "all"
  });

  const [masters, setMasters] = useState<MasterState>(emptyMasters);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [releaseDates, setReleaseDates] = useState<ReleaseDateRow[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [createForm, setCreateForm] = useState<CreateTaskForm | null>(null);
  const [releaseForm, setReleaseForm] = useState<ReleaseForm>({
    channelId: "",
    scriptNo: "",
    scriptTitle: "",
    releaseDate: today(),
    label: ""
  });

  const [laneInteraction, setLaneInteraction] = useState<LaneInteraction | null>(null);
  const [barInteraction, setBarInteraction] = useState<BarInteraction | null>(null);
  const [barPreview, setBarPreview] = useState<Record<string, { startDate: string; endDate: string }>>({});

  const canWrite = role === "admin" || role === "editor";
  const canAdmin = role === "admin";

  const timelineDates = useMemo(() => dateRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const dateToIndex = useMemo(() => new Map(timelineDates.map((date, index) => [date, index])), [timelineDates]);

  const loadMasters = useCallback(async () => {
    const [channels, taskTypes, taskStatuses, assignees] = await Promise.all([
      fetchJson<Channel[]>(`/api/masters/channels?workspaceId=${workspaceId}`),
      fetchJson<TaskType[]>(`/api/masters/task_types?workspaceId=${workspaceId}`),
      fetchJson<TaskStatus[]>(`/api/masters/task_statuses?workspaceId=${workspaceId}`),
      fetchJson<Assignee[]>(`/api/masters/assignees?workspaceId=${workspaceId}`)
    ]);

    setMasters({ channels, taskTypes, taskStatuses, assignees });
  }, [workspaceId]);

  const loadTasks = useCallback(async () => {
    const params = new URLSearchParams({
      workspaceId,
      sortBy,
      rangeStart,
      rangeEnd
    });

    if (filters.channelId !== "all") params.set("channelIds", filters.channelId);
    if (filters.assigneeId !== "all") params.set("assigneeIds", filters.assigneeId);
    if (filters.statusId !== "all") params.set("statusIds", filters.statusId);
    if (filters.taskTypeId !== "all") params.set("taskTypeIds", filters.taskTypeId);

    const rows = await fetchJson<TaskRow[]>(`/api/tasks?${params.toString()}`);
    setTasks(rows);
  }, [workspaceId, sortBy, rangeStart, rangeEnd, filters]);

  const loadReleaseDates = useCallback(async () => {
    const params = new URLSearchParams({ workspaceId, rangeStart, rangeEnd });
    const rows = await fetchJson<ReleaseDateRow[]>(`/api/release-dates?${params.toString()}`);
    setReleaseDates(rows);
  }, [workspaceId, rangeStart, rangeEnd]);

  const loadMembers = useCallback(async () => {
    const rows = await fetchJson<WorkspaceMember[]>(`/api/members?workspaceId=${workspaceId}`);
    setMembers(rows);
  }, [workspaceId]);

  const refreshBoard = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      await Promise.all([loadTasks(), loadReleaseDates()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "データ取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [loadTasks, loadReleaseDates]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        setLoading(true);
        await Promise.all([loadMasters(), loadMembers()]);
        if (!mounted) return;
        await refreshBoard();
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "初期化に失敗しました");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [loadMasters, loadMembers, refreshBoard]);

  useEffect(() => {
    void refreshBoard();
  }, [sortBy, rangeStart, rangeEnd, filters, refreshBoard]);

  useEffect(() => {
    const supabase = createClientSupabase();
    const channel = supabase
      .channel(`ws-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          void loadTasks();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "release_dates", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          void loadReleaseDates();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, loadTasks, loadReleaseDates]);

  useEffect(() => {
    if (!masters.channels.length) return;
    if (!releaseForm.channelId) {
      setReleaseForm((current) => ({ ...current, channelId: masters.channels[0].id }));
    }
  }, [masters.channels, releaseForm.channelId]);

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [
        {
          id: "all",
          name: "All Tasks",
          items: tasks
        }
      ];
    }

    const tasksByChannel = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      if (!tasksByChannel.has(task.channel_id)) {
        tasksByChannel.set(task.channel_id, []);
      }
      tasksByChannel.get(task.channel_id)?.push(task);
    }

    const sortedChannels = [...masters.channels].sort((a, b) => a.sort_order - b.sort_order);
    return sortedChannels
      .map((channel) => ({ id: channel.id, name: channel.name, items: tasksByChannel.get(channel.id) ?? [] }))
      .filter((group) => group.items.length > 0 || groupBy === "channel");
  }, [groupBy, tasks, masters.channels]);

  const knownScripts = useMemo(() => {
    const map = new Map<string, { scriptNo: string; title: string }>();
    for (const task of tasks) {
      if (!map.has(task.script_no)) {
        map.set(task.script_no, { scriptNo: task.script_no, title: task.script_title ?? "" });
      }
    }
    return [...map.values()];
  }, [tasks]);

  const openCreateModal = (draft: CreateDraft) => {
    const defaultTaskType = masters.taskTypes[0]?.id ?? "";
    const defaultStatus = masters.taskStatuses[0]?.id ?? "";
    const fallbackChannel = masters.channels[0]?.id ?? "";
    const safeChannelId = masters.channels.some((channel) => channel.id === draft.channelId)
      ? draft.channelId
      : fallbackChannel;

    setCreateDraft(draft);
    setCreateForm({
      channelId: safeChannelId,
      scriptNo: "",
      scriptTitle: "",
      taskTypeId: defaultTaskType,
      statusId: defaultStatus,
      assigneeId: "",
      taskName: "",
      startDate: draft.startDate,
      endDate: draft.endDate,
      notes: ""
    });
  };

  const closeCreateModal = () => {
    setCreateDraft(null);
    setCreateForm(null);
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createForm) return;

    try {
      await fetchJson<TaskRow>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          channelId: createForm.channelId,
          scriptNo: createForm.scriptNo,
          scriptTitle: createForm.scriptTitle || undefined,
          taskTypeId: createForm.taskTypeId,
          statusId: createForm.statusId,
          assigneeId: createForm.assigneeId || null,
          taskName: createForm.taskName,
          startDate: createForm.startDate,
          endDate: createForm.endDate,
          notes: createForm.notes || undefined
        })
      });
      closeCreateModal();
      await loadTasks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "タスク作成に失敗しました");
    }
  };

  const handlePatchTask = async (taskId: string, patch: Record<string, unknown>) => {
    try {
      await fetchJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, ...patch })
      });
      await loadTasks();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "タスク更新に失敗しました");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return;

    try {
      await fetchJson(`/api/tasks/${taskId}?workspaceId=${workspaceId}`, {
        method: "DELETE"
      });
      await loadTasks();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "タスク削除に失敗しました");
    }
  };

  const handleSaveReleaseDate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await fetchJson("/api/release-dates", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          channelId: releaseForm.channelId,
          scriptNo: releaseForm.scriptNo,
          scriptTitle: releaseForm.scriptTitle || undefined,
          releaseDate: releaseForm.releaseDate,
          label: releaseForm.label || undefined
        })
      });
      setReleaseForm((current) => ({ ...current, scriptNo: "", scriptTitle: "", label: "" }));
      await loadReleaseDates();
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "公開日更新に失敗しました");
    }
  };

  const createMaster = async (resource: "channels" | "task_types" | "assignees", name: string) => {
    if (!name.trim()) return;
    await fetchJson(`/api/masters/${resource}`, {
      method: "POST",
      body: JSON.stringify({ workspaceId, name: name.trim() })
    });
    await loadMasters();
  };

  const updateMemberRole = async (userId: string, nextRole: WorkspaceRole) => {
    await fetchJson("/api/members", {
      method: "PATCH",
      body: JSON.stringify({
        workspaceId,
        userId,
        role: nextRole
      })
    });
    await loadMembers();
  };

  const patchMaster = async (
    resource: "channels" | "task_types" | "assignees",
    id: string,
    patch: Record<string, unknown>
  ) => {
    await fetchJson(`/api/masters/${resource}`, {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, id, ...patch })
    });
    await loadMasters();
  };

  const releaseByChannel = useMemo(() => {
    const visibleScriptIds = new Set(tasks.map((task) => task.script_id));
    const filteredReleaseDates = releaseDates.filter((releaseDate) => {
      if (filters.channelId !== "all" && releaseDate.channel_id !== filters.channelId) {
        return false;
      }
      return visibleScriptIds.has(releaseDate.script_id);
    });

    const map = new Map<string, ReleaseDateRow[]>();
    for (const releaseDate of filteredReleaseDates) {
      if (!map.has(releaseDate.channel_id)) {
        map.set(releaseDate.channel_id, []);
      }
      map.get(releaseDate.channel_id)?.push(releaseDate);
    }
    return map;
  }, [releaseDates, tasks, filters.channelId]);

  const visibleReleaseDates = useMemo(() => {
    const visibleScriptIds = new Set(tasks.map((task) => task.script_id));
    return releaseDates.filter((releaseDate) => {
      if (filters.channelId !== "all" && releaseDate.channel_id !== filters.channelId) {
        return false;
      }
      return visibleScriptIds.has(releaseDate.script_id);
    });
  }, [releaseDates, tasks, filters.channelId]);

  const barRange = (task: TaskRow) => {
    const preview = barPreview[task.id];
    const startDate = preview?.startDate ?? task.start_date;
    const endDate = preview?.endDate ?? task.end_date;
    const startIndex = dateToIndex.get(startDate);
    const endIndex = dateToIndex.get(endDate);

    if (startIndex === undefined || endIndex === undefined) {
      const fallbackStart = clamp(dateToIndex.get(task.start_date) ?? 0, 0, timelineDates.length - 1);
      const fallbackEnd = clamp(dateToIndex.get(task.end_date) ?? fallbackStart, fallbackStart, timelineDates.length - 1);
      return { startIndex: fallbackStart, endIndex: fallbackEnd, startDate, endDate };
    }

    return {
      startIndex: clamp(startIndex, 0, timelineDates.length - 1),
      endIndex: clamp(endIndex, startIndex, timelineDates.length - 1),
      startDate,
      endDate
    };
  };

  const indexFromPointer = (event: React.PointerEvent<HTMLElement>, laneElement: HTMLElement) => {
    const rect = laneElement.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left + laneElement.scrollLeft, 0, totalTimelineWidth - 1);
    const index = clamp(Math.floor(x / DAY_WIDTH), 0, timelineDates.length - 1);
    return index;
  };

  const applyBarPreview = (interaction: BarInteraction, targetIndex: number) => {
    const baseStartIndex = dateToIndex.get(interaction.baseStart) ?? 0;
    const baseEndIndex = dateToIndex.get(interaction.baseEnd) ?? baseStartIndex;
    let nextStartIndex = baseStartIndex;
    let nextEndIndex = baseEndIndex;

    if (interaction.type === "move") {
      const duration = Math.max(0, baseEndIndex - baseStartIndex);
      nextStartIndex = clamp(targetIndex - interaction.offsetDays, 0, timelineDates.length - 1);
      nextEndIndex = clamp(nextStartIndex + duration, nextStartIndex, timelineDates.length - 1);
    }

    if (interaction.type === "resize-start") {
      nextStartIndex = clamp(targetIndex, 0, baseEndIndex);
      nextEndIndex = baseEndIndex;
    }

    if (interaction.type === "resize-end") {
      nextStartIndex = baseStartIndex;
      nextEndIndex = clamp(targetIndex, baseStartIndex, timelineDates.length - 1);
    }

    setBarPreview((current) => ({
      ...current,
      [interaction.taskId]: {
        startDate: timelineDates[nextStartIndex],
        endDate: timelineDates[nextEndIndex]
      }
    }));
  };

  const commitBarPreview = async (taskId: string) => {
    const preview = barPreview[taskId];
    const task = tasks.find((item) => item.id === taskId);
    if (!preview || !task) {
      setBarPreview((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      return;
    }

    const changed = preview.startDate !== task.start_date || preview.endDate !== task.end_date;
    setBarPreview((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });

    if (!changed) return;
    await handlePatchTask(taskId, { startDate: preview.startDate, endDate: preview.endDate });
  };

  const totalTimelineWidth = timelineDates.length * DAY_WIDTH;

  return (
    <main className="app-shell" style={{ display: "grid", gap: 14 }}>
      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 className="headline" style={{ margin: 0 }}>
              {workspaceName}
            </h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {userEmail} / Role: <span className="badge">{role}</span>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label>
              Group
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
                style={{ marginLeft: 6 }}
              >
                <option value="channel">チャンネル</option>
                <option value="none">なし</option>
              </select>
            </label>
            <label>
              Sort
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                style={{ marginLeft: 6 }}
              >
                <option value="script_no_asc">脚本番号 ↑</option>
                <option value="script_no_desc">脚本番号 ↓</option>
                <option value="start_date_asc">開始日 ↑</option>
                <option value="start_date_desc">開始日 ↓</option>
              </select>
            </label>
            <label>
              期間
              <input
                type="date"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
                style={{ marginLeft: 6 }}
              />
              <span style={{ margin: "0 4px" }}>~</span>
              <input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <label>
            チャンネル
            <select
              value={filters.channelId}
              onChange={(event) => setFilters((current) => ({ ...current, channelId: event.target.value }))}
              style={{ marginLeft: 6 }}
            >
              <option value="all">すべて</option>
              {masters.channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            担当
            <select
              value={filters.assigneeId}
              onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))}
              style={{ marginLeft: 6 }}
            >
              <option value="all">すべて</option>
              {masters.assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.display_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            ステータス
            <select
              value={filters.statusId}
              onChange={(event) => setFilters((current) => ({ ...current, statusId: event.target.value }))}
              style={{ marginLeft: 6 }}
            >
              <option value="all">すべて</option>
              {masters.taskStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            タスク種
            <select
              value={filters.taskTypeId}
              onChange={(event) => setFilters((current) => ({ ...current, taskTypeId: event.target.value }))}
              style={{ marginLeft: 6 }}
            >
              <option value="all">すべて</option>
              {masters.taskTypes.map((taskType) => (
                <option key={taskType.id} value={taskType.id}>
                  {taskType.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="card" style={{ padding: 10, color: "var(--danger)", borderColor: "#d8bbbb" }}>
            {error}
          </div>
        ) : null}
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${LEFT_WIDTH}px 1fr`,
            minWidth: LEFT_WIDTH + totalTimelineWidth,
            borderBottom: "1px solid var(--line)"
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "140px 110px 110px 90px 110px 1fr 110px 110px 50px",
              alignItems: "center",
              height: 44,
              background: "var(--panel-muted)",
              borderRight: "1px solid var(--line)",
              fontSize: 12,
              fontWeight: 600,
              padding: "0 10px",
              gap: 8,
              position: "sticky",
              left: 0,
              zIndex: 4
            }}
          >
            <span>ステータス</span>
            <span>チャンネル</span>
            <span>担当</span>
            <span>脚本番号</span>
            <span>タスク種</span>
            <span>タスク名</span>
            <span>開始日</span>
            <span>終了日</span>
            <span />
          </div>

          <div style={{ position: "relative", background: "var(--panel-muted)", overflowX: "auto" }}>
            <div style={{ display: "flex", width: totalTimelineWidth, height: 44 }}>
              {timelineDates.map((date) => (
                <div
                  key={date}
                  style={{
                    width: DAY_WIDTH,
                    borderLeft: "1px solid var(--line)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "grid",
                    placeItems: "center"
                  }}
                >
                  {toDateLabel(date)}
                </div>
              ))}
            </div>

            {visibleReleaseDates.map((releaseDate) => {
              const index = dateToIndex.get(releaseDate.release_date);
              if (index === undefined) return null;

              return (
                <div
                  key={`marker-head-${releaseDate.id}`}
                  title={`${releaseDate.channel_name} / ${releaseDate.script_no} / ${releaseDate.release_date}${releaseDate.label ? ` / ${releaseDate.label}` : ""}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: index * DAY_WIDTH + DAY_WIDTH / 2,
                    width: 2,
                    background: "#bc4f2f",
                    opacity: 0.6
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ maxHeight: "65vh", overflow: "auto", background: "#fff" }}>
          {loading ? (
            <div style={{ padding: 20 }} className="muted">
              Loading...
            </div>
          ) : null}

          {!loading && grouped.length === 0 ? (
            <div style={{ padding: 20 }} className="muted">
              タスクがありません。
            </div>
          ) : null}

          {grouped.map((group) => {
            const releases = releaseByChannel.get(group.id) ?? [];

            return (
              <div key={group.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${LEFT_WIDTH}px 1fr`,
                    minWidth: LEFT_WIDTH + totalTimelineWidth,
                    background: "#f9f7f1"
                  }}
                >
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRight: "1px solid var(--line)",
                      position: "sticky",
                      left: 0,
                      background: "#f9f7f1",
                      zIndex: 2
                    }}
                  >
                    <strong>{group.name}</strong>
                    <span className="muted" style={{ marginLeft: 8 }}>
                      {group.items.length} tasks
                    </span>
                  </div>
                  <div style={{ padding: "8px 10px", overflowX: "auto" }} className="muted">
                    {releases.length ? `${releases.length}件の公開日マーカー` : "公開日マーカーなし"}
                  </div>
                </div>

                {group.items.map((task) => {
                  const range = barRange(task);

                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: `${LEFT_WIDTH}px 1fr`,
                        minWidth: LEFT_WIDTH + totalTimelineWidth,
                        height: 42,
                        borderTop: "1px solid #f0eee8"
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "140px 110px 110px 90px 110px 1fr 110px 110px 50px",
                          alignItems: "center",
                          padding: "0 10px",
                          gap: 8,
                          borderRight: "1px solid var(--line)",
                          position: "sticky",
                          left: 0,
                          background: "#fff",
                          zIndex: 1
                        }}
                      >
                        <select
                          value={task.status_id}
                          disabled={!canWrite}
                          onChange={(event) => {
                            void handlePatchTask(task.id, { statusId: event.target.value });
                          }}
                        >
                          {masters.taskStatuses.map((status) => (
                            <option key={status.id} value={status.id}>
                              {status.name}
                            </option>
                          ))}
                        </select>

                        <span>{task.channel_name}</span>

                        <select
                          value={task.assignee_id ?? ""}
                          disabled={!canWrite}
                          onChange={(event) => {
                            void handlePatchTask(task.id, { assigneeId: event.target.value || null });
                          }}
                        >
                          <option value="">未割当</option>
                          {masters.assignees.map((assignee) => (
                            <option key={assignee.id} value={assignee.id}>
                              {assignee.display_name}
                            </option>
                          ))}
                        </select>

                        <span>{task.script_no}</span>
                        <span>{task.task_type_name}</span>

                        <input
                          defaultValue={task.task_name}
                          disabled={!canWrite}
                          onBlur={(event) => {
                            if (event.target.value !== task.task_name) {
                              void handlePatchTask(task.id, { taskName: event.target.value });
                            }
                          }}
                        />

                        <input
                          type="date"
                          value={range.startDate}
                          disabled={!canWrite}
                          onChange={(event) => {
                            void handlePatchTask(task.id, { startDate: event.target.value });
                          }}
                        />
                        <input
                          type="date"
                          value={range.endDate}
                          disabled={!canWrite}
                          onChange={(event) => {
                            void handlePatchTask(task.id, { endDate: event.target.value });
                          }}
                        />

                        <button
                          type="button"
                          className="danger"
                          disabled={!canWrite}
                          onClick={() => {
                            void handleDeleteTask(task.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <div
                        style={{ position: "relative", overflowX: "auto" }}
                        onPointerMove={(event) => {
                          if (!barInteraction) return;
                          if (barInteraction.pointerId !== event.pointerId) return;

                          const lane = event.currentTarget;
                          const index = indexFromPointer(event, lane);
                          applyBarPreview(barInteraction, index);
                        }}
                        onPointerUp={(event) => {
                          if (!barInteraction) return;
                          if (barInteraction.pointerId !== event.pointerId) return;
                          void commitBarPreview(barInteraction.taskId);
                          setBarInteraction(null);
                        }}
                      >
                        <div style={{ position: "relative", width: totalTimelineWidth, height: 42 }}>
                          {timelineDates.map((date) => (
                            <div
                              key={`${task.id}-${date}`}
                              style={{
                                position: "absolute",
                                left: dateToIndex.get(date)! * DAY_WIDTH,
                                top: 0,
                                bottom: 0,
                                width: DAY_WIDTH,
                                borderLeft: "1px solid #f0eee8"
                              }}
                            />
                          ))}

                          {visibleReleaseDates.map((releaseDate) => {
                            const markerIndex = dateToIndex.get(releaseDate.release_date);
                            if (markerIndex === undefined) return null;

                            return (
                              <div
                                key={`marker-row-${task.id}-${releaseDate.id}`}
                                title={`${releaseDate.channel_name} / ${releaseDate.script_no} / ${releaseDate.release_date}`}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  left: markerIndex * DAY_WIDTH + DAY_WIDTH / 2,
                                  width: 1,
                                  background: releaseDate.channel_id === task.channel_id ? "#bc4f2f" : "#d7c6b9",
                                  opacity: releaseDate.channel_id === task.channel_id ? 0.7 : 0.25
                                }}
                              />
                            );
                          })}

                          <div
                            role="button"
                            tabIndex={-1}
                            onPointerDown={(event) => {
                              if (!canWrite) return;
                              const lane = event.currentTarget.parentElement as HTMLElement;
                              const index = indexFromPointer(event, lane);
                              const pointerId = event.pointerId;
                              lane.setPointerCapture(pointerId);
                              const offset = index - (dateToIndex.get(range.startDate) ?? index);
                              setBarInteraction({
                                taskId: task.id,
                                type: "move",
                                pointerId,
                                baseStart: range.startDate,
                                baseEnd: range.endDate,
                                offsetDays: offset
                              });
                            }}
                            style={{
                              position: "absolute",
                              top: 8,
                              left: range.startIndex * DAY_WIDTH + 2,
                              width: Math.max(DAY_WIDTH - 4, (range.endIndex - range.startIndex + 1) * DAY_WIDTH - 4),
                              height: 26,
                              borderRadius: 7,
                              background: "linear-gradient(120deg, #4b8aff, #2b66d7)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 8px",
                              fontSize: 12,
                              cursor: canWrite ? "grab" : "default",
                              userSelect: "none",
                              overflow: "hidden"
                            }}
                          >
                            {task.task_name}
                            <span
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                if (!canWrite) return;
                                const lane = (event.currentTarget.parentElement?.parentElement as HTMLElement) ?? null;
                                if (!lane) return;
                                const pointerId = event.pointerId;
                                lane.setPointerCapture(pointerId);
                                setBarInteraction({
                                  taskId: task.id,
                                  type: "resize-start",
                                  pointerId,
                                  baseStart: range.startDate,
                                  baseEnd: range.endDate,
                                  offsetDays: 0
                                });
                              }}
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 8,
                                cursor: canWrite ? "ew-resize" : "default"
                              }}
                            />
                            <span
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                if (!canWrite) return;
                                const lane = (event.currentTarget.parentElement?.parentElement as HTMLElement) ?? null;
                                if (!lane) return;
                                const pointerId = event.pointerId;
                                lane.setPointerCapture(pointerId);
                                setBarInteraction({
                                  taskId: task.id,
                                  type: "resize-end",
                                  pointerId,
                                  baseStart: range.startDate,
                                  baseEnd: range.endDate,
                                  offsetDays: 0
                                });
                              }}
                              style={{
                                position: "absolute",
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: 8,
                                cursor: canWrite ? "ew-resize" : "default"
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${LEFT_WIDTH}px 1fr`,
                    minWidth: LEFT_WIDTH + totalTimelineWidth,
                    height: 34,
                    borderTop: "1px dashed var(--line)",
                    background: "#fdfcf8"
                  }}
                >
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRight: "1px solid var(--line)",
                      position: "sticky",
                      left: 0,
                      background: "#fdfcf8",
                      zIndex: 1
                    }}
                    className="muted"
                  >
                    + ドラッグして新規タスク作成
                  </div>
                  <div
                    style={{ position: "relative", overflowX: "auto" }}
                    onPointerDown={(event) => {
                      if (!canWrite) return;
                      const lane = event.currentTarget;
                      const index = indexFromPointer(event, lane);
                      lane.setPointerCapture(event.pointerId);
                      setLaneInteraction({
                        channelId: group.id,
                        pointerId: event.pointerId,
                        anchorIndex: index,
                        currentIndex: index
                      });
                    }}
                    onPointerMove={(event) => {
                      if (!laneInteraction) return;
                      if (event.pointerId !== laneInteraction.pointerId) return;

                      const lane = event.currentTarget;
                      const index = indexFromPointer(event, lane);
                      setLaneInteraction((current) => (current ? { ...current, currentIndex: index } : null));
                    }}
                    onPointerUp={(event) => {
                      if (!laneInteraction) return;
                      if (event.pointerId !== laneInteraction.pointerId) return;

                      const startIndex = Math.min(laneInteraction.anchorIndex, laneInteraction.currentIndex);
                      const endIndex = Math.max(laneInteraction.anchorIndex, laneInteraction.currentIndex);
                      const channelId =
                        group.id === "all" ? (masters.channels[0]?.id ?? "") : laneInteraction.channelId;
                      if (!channelId) {
                        setLaneInteraction(null);
                        return;
                      }
                      openCreateModal({
                        channelId,
                        startDate: timelineDates[startIndex],
                        endDate: timelineDates[endIndex]
                      });
                      setLaneInteraction(null);
                    }}
                  >
                    <div style={{ position: "relative", width: totalTimelineWidth, height: 34 }}>
                      {timelineDates.map((date) => (
                        <div
                          key={`create-${group.id}-${date}`}
                          style={{
                            position: "absolute",
                            left: dateToIndex.get(date)! * DAY_WIDTH,
                            width: DAY_WIDTH,
                            top: 0,
                            bottom: 0,
                            borderLeft: "1px solid #f3f1ea"
                          }}
                        />
                      ))}

                      {laneInteraction && laneInteraction.channelId === group.id ? (
                        <div
                          style={{
                            position: "absolute",
                            left: Math.min(laneInteraction.anchorIndex, laneInteraction.currentIndex) * DAY_WIDTH + 2,
                            top: 5,
                            height: 24,
                            width:
                              (Math.max(laneInteraction.anchorIndex, laneInteraction.currentIndex) -
                                Math.min(laneInteraction.anchorIndex, laneInteraction.currentIndex) +
                                1) *
                                DAY_WIDTH -
                              4,
                            borderRadius: 5,
                            background: "rgba(36, 89, 204, 0.22)",
                            border: "1px solid rgba(36, 89, 204, 0.6)"
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>公開日マーカー管理</h2>
        <form onSubmit={handleSaveReleaseDate} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
          <select
            value={releaseForm.channelId}
            onChange={(event) => setReleaseForm((current) => ({ ...current, channelId: event.target.value }))}
            required
          >
            {masters.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>

          <input
            value={releaseForm.scriptNo}
            placeholder="脚本番号"
            onChange={(event) => setReleaseForm((current) => ({ ...current, scriptNo: event.target.value }))}
            required
          />

          <input
            value={releaseForm.scriptTitle}
            placeholder="タイトル(任意)"
            onChange={(event) => setReleaseForm((current) => ({ ...current, scriptTitle: event.target.value }))}
          />

          <input
            type="date"
            value={releaseForm.releaseDate}
            onChange={(event) => setReleaseForm((current) => ({ ...current, releaseDate: event.target.value }))}
            required
          />

          <input
            value={releaseForm.label}
            placeholder="ラベル(任意)"
            onChange={(event) => setReleaseForm((current) => ({ ...current, label: event.target.value }))}
          />

          <button className="primary" type="submit" disabled={!canWrite}>
            保存
          </button>
        </form>

        {knownScripts.length ? (
          <div className="muted" style={{ fontSize: 12 }}>
            既存脚本番号: {knownScripts.map((script) => script.scriptNo).join(", ")}
          </div>
        ) : null}
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>ロール管理</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          管理者のみ変更可能です。ユーザー招待自体はSupabase Auth側で行ってください。
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {members.map((member) => (
            <div
              key={member.user_id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px",
                gap: 10,
                alignItems: "center",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "8px 10px"
              }}
            >
              <div>
                <div style={{ fontSize: 13, wordBreak: "break-all" }}>{member.user_id}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  joined: {member.created_at.slice(0, 10)}
                </div>
              </div>

              <select
                value={member.role}
                disabled={!canAdmin}
                onChange={(event) => {
                  void updateMemberRole(member.user_id, event.target.value as WorkspaceRole);
                }}
              >
                <option value="admin">admin</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
          ))}

          {!members.length ? <div className="muted">メンバーがまだいません。</div> : null}
        </div>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>マスタ管理</h2>
        {!canAdmin ? <div className="muted">管理者のみ編集できます。</div> : null}
        <MasterEditor
          title="チャンネル"
          resource="channels"
          items={masters.channels.map((channel) => ({
            id: channel.id,
            label: channel.name,
            active: channel.is_active
          }))}
          canEdit={canAdmin}
          onCreate={async (name) => createMaster("channels", name)}
          onToggle={async (id, active) => patchMaster("channels", id, { isActive: active })}
        />

        <MasterEditor
          title="タスク種"
          resource="task_types"
          items={masters.taskTypes.map((taskType) => ({
            id: taskType.id,
            label: taskType.name,
            active: taskType.is_active
          }))}
          canEdit={canAdmin}
          onCreate={async (name) => createMaster("task_types", name)}
          onToggle={async (id, active) => patchMaster("task_types", id, { isActive: active })}
        />

        <MasterEditor
          title="担当者"
          resource="assignees"
          items={masters.assignees.map((assignee) => ({
            id: assignee.id,
            label: assignee.display_name,
            active: assignee.is_active
          }))}
          canEdit={canAdmin}
          onCreate={async (name) => createMaster("assignees", name)}
          onToggle={async (id, active) => patchMaster("assignees", id, { isActive: active })}
        />
      </section>

      {createForm && createDraft ? (
        <dialog open style={{ border: "1px solid var(--line)", borderRadius: 12, width: "min(560px, 95vw)" }}>
          <form onSubmit={handleCreateTask} style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>新規タスク作成</h3>
            <div className="muted" style={{ fontSize: 13 }}>
              {createDraft.startDate} ~ {createDraft.endDate}
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              チャンネル
              <select
                value={createForm.channelId}
                onChange={(event) => setCreateForm((current) => (current ? { ...current, channelId: event.target.value } : current))}
              >
                {masters.channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                脚本番号
                <input
                  value={createForm.scriptNo}
                  required
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, scriptNo: event.target.value } : current))
                  }
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                脚本タイトル
                <input
                  value={createForm.scriptTitle}
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, scriptTitle: event.target.value } : current))
                  }
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              タスク名
              <input
                value={createForm.taskName}
                required
                onChange={(event) =>
                  setCreateForm((current) => (current ? { ...current, taskName: event.target.value } : current))
                }
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                タスク種
                <select
                  value={createForm.taskTypeId}
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, taskTypeId: event.target.value } : current))
                  }
                >
                  {masters.taskTypes.map((taskType) => (
                    <option key={taskType.id} value={taskType.id}>
                      {taskType.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                ステータス
                <select
                  value={createForm.statusId}
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, statusId: event.target.value } : current))
                  }
                >
                  {masters.taskStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                担当
                <select
                  value={createForm.assigneeId}
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, assigneeId: event.target.value } : current))
                  }
                >
                  <option value="">未割当</option>
                  {masters.assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                開始日
                <input
                  type="date"
                  value={createForm.startDate}
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, startDate: event.target.value } : current))
                  }
                />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                終了日
                <input
                  type="date"
                  value={createForm.endDate}
                  onChange={(event) =>
                    setCreateForm((current) => (current ? { ...current, endDate: event.target.value } : current))
                  }
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              備考
              <textarea
                value={createForm.notes}
                rows={3}
                onChange={(event) =>
                  setCreateForm((current) => (current ? { ...current, notes: event.target.value } : current))
                }
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={closeCreateModal}>
                キャンセル
              </button>
              <button className="primary" type="submit">
                作成
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </main>
  );
}

function MasterEditor({
  title,
  resource,
  items,
  canEdit,
  onCreate,
  onToggle
}: {
  title: string;
  resource: string;
  items: { id: string; label: string; active: boolean }[];
  canEdit: boolean;
  onCreate: (name: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !name.trim()) return;

    setBusy(true);
    try {
      await onCreate(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>{title}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {resource}
        </span>
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`${title}を追加`}
          disabled={!canEdit || busy}
        />
        <button type="submit" className="primary" disabled={!canEdit || busy}>
          追加
        </button>
      </form>

      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <label
            key={item.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "8px 10px"
            }}
          >
            <span>{item.label}</span>
            <input
              type="checkbox"
              checked={item.active}
              disabled={!canEdit}
              onChange={(event) => {
                void onToggle(item.id, event.target.checked);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
