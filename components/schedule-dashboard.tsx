"use client";

import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
  subDays
} from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "@/lib/http";
import { dateRange, isNonWorkingDay } from "@/lib/date";
import { buildSortOrderPatches, getNextSortOrder, moveItemByDrop, type DropPosition } from "@/lib/master-order";
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

const DAY_WIDTH = 26;
const MONTH_LABEL_SWITCH_OFFSET = Math.floor(DAY_WIDTH * 1.2);
const TASK_ROW_HEIGHT = DAY_WIDTH;
const CREATE_ROW_HEIGHT = DAY_WIDTH;
const BAR_HEIGHT = Math.max(16, DAY_WIDTH - 8);
const RELEASE_BAND_ROW_HEIGHT = DAY_WIDTH;
const MONTH_ROW_HEIGHT = DAY_WIDTH;
const DAY_ROW_HEIGHT = DAY_WIDTH;
const WEEKDAY_ROW_HEIGHT = DAY_WIDTH;
const TABLE_GAP = 6;
const TABLE_SIDE_PADDING = 20;
const TABLE_COLUMN_WIDTHS = [82, 70, 66, 72, 128, 58, 58, 46] as const;
const LEFT_GRID_TEMPLATE = TABLE_COLUMN_WIDTHS.map((width) => `${width}px`).join(" ");
const LEFT_WIDTH =
  TABLE_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0) + TABLE_GAP * (TABLE_COLUMN_WIDTHS.length - 1) + TABLE_SIDE_PADDING;
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
const RELEASE_ROW_TONES = ["#dfe8f7", "#f0e4d1", "#efe9d7", "#f3e8d7", "#e3ebdd", "#ebe2f2"] as const;
const NON_WORKING_DAY_BG = "#ececec";
const TODAY_COLUMN_BG = "#fff1a8";
const TIMELINE_GRID_BORDER = "#b8b8b8";
const TOP_PANEL_MIN_HEIGHT = 188;
const TOP_PANEL_DETAIL_MIN_HEIGHT = 88;
const UNASSIGNED_ASSIGNEE_GROUP_ID = "__unassigned_assignee__";

type GroupBy = "channel" | "assignee" | "none";
type MasterResource = "channels" | "task_types" | "assignees" | "task_statuses";
type ViewTab = "schedule" | "masters";
type MasterTab = "release_dates" | "channels" | "task_types" | "assignees" | "task_statuses" | "members";

type Filters = {
  channelId: string;
  assigneeId: string;
  statusId: string;
  taskTypeId: string;
};

type CreateDraft = {
  channelId: string;
  assigneeId: string;
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

type EditTaskForm = CreateTaskForm & {
  taskId: string;
};

type ReleaseForm = {
  channelId: string;
  scriptNo: string;
  releaseDate: string;
  label: string;
};

type TimelineDayCell = {
  date: string;
  dayLabel: string;
  weekdayLabel: string;
  monthKey: string;
  monthLabel: string;
  isNonWorkingDay: boolean;
  isToday: boolean;
};

type TimelineMonthGroup = {
  key: string;
  label: string;
  startIndex: number;
  length: number;
};

type ChannelReleaseBandRow = {
  channelId: string;
  label: string;
  tone: string;
  maxStack: number;
  height: number;
  placeholder?: boolean;
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
  baseStartIndex: number;
  baseEndIndex: number;
  offsetDays: number;
  moved: boolean;
  lastIndex: number;
};

type LaneInteraction = {
  laneKey: string;
  channelId: string;
  pointerId: number;
  anchorIndex: number;
  currentIndex: number;
};

type BulkImportRow = {
  lineNo: number;
  channelName: string;
  assigneeName: string;
  scriptNo: string;
  taskTypeName: string;
  taskName: string;
  startDate: string;
  endDate: string;
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

function toMonthLabel(dateString: string) {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? format(parsed, "M月") : dateString;
}

function toYearMonthLabel(dateString: string) {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? format(parsed, "yyyy年 M月") : dateString;
}

function toDayLabel(dateString: string) {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? format(parsed, "d") : dateString;
}

function toWeekdayLabel(dateString: string) {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? WEEKDAY_JA[parsed.getDay()] : "";
}

function toMonthDayLabel(dateString: string) {
  const parsed = parseISO(dateString);
  return isValid(parsed) ? format(parsed, "M月 d日") : dateString;
}

function toIsoDateFromInput(input: string, year: number) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const matched = trimmed.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!matched) return null;

  const month = Number(matched[1]);
  const day = Number(matched[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseBulkImportText(rawText: string, year: number) {
  const rows: BulkImportRow[] = [];
  const errors: string[] = [];

  const lines = rawText
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNo = index + 1;
    const columns = line.split("\t").map((column) => column.trim());

    if (columns.length < 7) {
      errors.push(`行${lineNo}: 列数が不足しています（7列必要）`);
      continue;
    }

    const channelName = columns[0] ?? "";
    const assigneeName = columns[1] ?? "";
    const scriptNo = columns[2] ?? "";
    const taskTypeName = columns[3] ?? "";
    const taskName = columns.slice(4, -2).join("\t").trim();
    const startRaw = columns.at(-2) ?? "";
    const endRaw = columns.at(-1) ?? "";

    if (!channelName || !taskTypeName || !taskName) {
      errors.push(`行${lineNo}: チャンネル・タスク種・タスク名は必須です`);
      continue;
    }

    const startDate = toIsoDateFromInput(startRaw, year);
    const endDate = toIsoDateFromInput(endRaw, year);
    if (!startDate || !endDate) {
      errors.push(`行${lineNo}: 日付形式が不正です (${startRaw} / ${endRaw})`);
      continue;
    }
    if (startDate > endDate) {
      errors.push(`行${lineNo}: 開始日が終了日より後です`);
      continue;
    }

    rows.push({
      lineNo,
      channelName,
      assigneeName,
      scriptNo,
      taskTypeName,
      taskName,
      startDate,
      endDate
    });
  }

  return { rows, errors };
}

function buildImportTaskKey(input: {
  channelId: string;
  taskTypeId: string;
  taskName: string;
  startDate: string;
  endDate: string;
  scriptNo: string;
}) {
  return [
    input.channelId,
    input.taskTypeId,
    input.taskName.trim(),
    input.startDate,
    input.endDate,
    input.scriptNo.trim()
  ].join("|");
}

function sortTaskRows(rows: TaskRow[], sortBy: SortBy): TaskRow[] {
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
  const todayDate = useMemo(() => today(), []);
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
  const [editForm, setEditForm] = useState<EditTaskForm | null>(null);
  const [releaseForm, setReleaseForm] = useState<ReleaseForm>({
    channelId: "",
    scriptNo: "",
    releaseDate: today(),
    label: ""
  });
  const [viewTab, setViewTab] = useState<ViewTab>("schedule");
  const [masterTab, setMasterTab] = useState<MasterTab>("release_dates");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportYear, setBulkImportYear] = useState(String(now.getFullYear()));
  const [bulkImportBusy, setBulkImportBusy] = useState(false);
  const [bulkImportMessage, setBulkImportMessage] = useState("");

  const [laneInteraction, setLaneInteraction] = useState<LaneInteraction | null>(null);
  const [barInteraction, setBarInteraction] = useState<BarInteraction | null>(null);
  const [barPreview, setBarPreview] = useState<Record<string, { startDate: string; endDate: string }>>({});
  const suppressBarClickTaskIdRef = useRef<string | null>(null);
  const suppressTasksRealtimeUntilRef = useRef(0);
  const suppressReleaseDatesRealtimeUntilRef = useRef(0);
  const taskReloadTimerRef = useRef<number | null>(null);
  const releaseDateReloadTimerRef = useRef<number | null>(null);
  const scheduleScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineMonthBadgeRef = useRef<HTMLSpanElement | null>(null);
  const monthLabelScrollRafRef = useRef<number | null>(null);
  const pendingMonthLabelScrollLeftRef = useRef(0);

  const canWrite = role === "admin" || role === "editor";
  const canAdmin = role === "admin";

  const timelineDates = useMemo(() => dateRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const dateToIndex = useMemo(() => new Map(timelineDates.map((date, index) => [date, index])), [timelineDates]);
  const [visibleMonthLabel, setVisibleMonthLabel] = useState(() => toYearMonthLabel(rangeStart));

  const syncVisibleMonthLabel = useCallback(
    (rawScrollLeft: number) => {
      const scrollLeft = Math.max(0, Math.round(rawScrollLeft));
      const monthBadge = timelineMonthBadgeRef.current;
      if (monthBadge) {
        monthBadge.style.left = `${scrollLeft + 6}px`;
      }

      if (!timelineDates.length) {
        setVisibleMonthLabel(toYearMonthLabel(rangeStart));
        return;
      }
      const firstVisibleIndex = clamp(
        Math.floor((scrollLeft + MONTH_LABEL_SWITCH_OFFSET) / DAY_WIDTH),
        0,
        timelineDates.length - 1
      );
      const nextLabel = toYearMonthLabel(timelineDates[firstVisibleIndex] ?? rangeStart);
      setVisibleMonthLabel((current) => (current === nextLabel ? current : nextLabel));
    },
    [timelineDates, rangeStart]
  );

  const flushMonthLabelScroll = useCallback(() => {
    monthLabelScrollRafRef.current = null;
    syncVisibleMonthLabel(pendingMonthLabelScrollLeftRef.current);
  }, [syncVisibleMonthLabel]);

  const handleScheduleScroll = useCallback(
    (scrollLeft: number) => {
      pendingMonthLabelScrollLeftRef.current = scrollLeft;
      if (monthLabelScrollRafRef.current !== null) return;
      monthLabelScrollRafRef.current = window.requestAnimationFrame(flushMonthLabelScroll);
    },
    [flushMonthLabelScroll]
  );

  useEffect(() => {
    const container = scheduleScrollRef.current;
    if (container) {
      handleScheduleScroll(container.scrollLeft);
      return;
    }
    syncVisibleMonthLabel(0);
  }, [handleScheduleScroll, syncVisibleMonthLabel]);

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
      sortBy
    });

    if (filters.channelId !== "all") params.set("channelIds", filters.channelId);
    if (filters.assigneeId !== "all") params.set("assigneeIds", filters.assigneeId);
    if (filters.statusId !== "all") params.set("statusIds", filters.statusId);
    if (filters.taskTypeId !== "all") params.set("taskTypeIds", filters.taskTypeId);

    const rows = await fetchJson<TaskRow[]>(`/api/tasks?${params.toString()}`);
    setTasks(rows);
  }, [workspaceId, sortBy, filters]);

  const loadReleaseDates = useCallback(async () => {
    const params = new URLSearchParams({ workspaceId, rangeStart, rangeEnd });
    const rows = await fetchJson<ReleaseDateRow[]>(`/api/release-dates?${params.toString()}`);
    setReleaseDates(rows);
  }, [workspaceId, rangeStart, rangeEnd]);

  const isTaskVisibleWithCurrentFilters = useCallback(
    (task: TaskRow) => {
      if (filters.channelId !== "all" && task.channel_id !== filters.channelId) return false;
      if (filters.assigneeId !== "all" && task.assignee_id !== filters.assigneeId) return false;
      if (filters.statusId !== "all" && task.status_id !== filters.statusId) return false;
      if (filters.taskTypeId !== "all" && task.task_type_id !== filters.taskTypeId) return false;
      return true;
    },
    [filters]
  );

  const upsertTaskInState = useCallback(
    (task: TaskRow) => {
      setTasks((current) => {
        const without = current.filter((item) => item.id !== task.id);
        if (!isTaskVisibleWithCurrentFilters(task)) {
          return without;
        }
        return sortTaskRows([...without, task], sortBy);
      });
    },
    [isTaskVisibleWithCurrentFilters, sortBy]
  );

  const removeTaskFromState = useCallback((taskId: string) => {
    setTasks((current) => current.filter((item) => item.id !== taskId));
  }, []);

  const isReleaseDateVisibleInRange = useCallback(
    (row: ReleaseDateRow) => row.release_date >= rangeStart && row.release_date <= rangeEnd,
    [rangeStart, rangeEnd]
  );

  const upsertReleaseDateInState = useCallback(
    (row: ReleaseDateRow) => {
      setReleaseDates((current) => {
        const without = current.filter((item) => item.id !== row.id);
        if (!isReleaseDateVisibleInRange(row)) {
          return without;
        }
        return [...without, row].sort((a, b) => a.release_date.localeCompare(b.release_date));
      });
    },
    [isReleaseDateVisibleInRange]
  );

  const removeReleaseDateFromState = useCallback((id: string) => {
    setReleaseDates((current) => current.filter((item) => item.id !== id));
  }, []);

  const suppressTasksRealtime = useCallback((durationMs = 2000) => {
    suppressTasksRealtimeUntilRef.current = Date.now() + durationMs;
  }, []);

  const suppressReleaseDatesRealtime = useCallback((durationMs = 2000) => {
    suppressReleaseDatesRealtimeUntilRef.current = Date.now() + durationMs;
  }, []);

  const scheduleTasksReload = useCallback(() => {
    if (taskReloadTimerRef.current !== null) {
      window.clearTimeout(taskReloadTimerRef.current);
    }
    taskReloadTimerRef.current = window.setTimeout(() => {
      taskReloadTimerRef.current = null;
      void loadTasks();
    }, 150);
  }, [loadTasks]);

  const scheduleReleaseDatesReload = useCallback(() => {
    if (releaseDateReloadTimerRef.current !== null) {
      window.clearTimeout(releaseDateReloadTimerRef.current);
    }
    releaseDateReloadTimerRef.current = window.setTimeout(() => {
      releaseDateReloadTimerRef.current = null;
      void loadReleaseDates();
    }, 150);
  }, [loadReleaseDates]);

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
    return () => {
      if (taskReloadTimerRef.current !== null) {
        window.clearTimeout(taskReloadTimerRef.current);
      }
      if (releaseDateReloadTimerRef.current !== null) {
        window.clearTimeout(releaseDateReloadTimerRef.current);
      }
      if (monthLabelScrollRafRef.current !== null) {
        window.cancelAnimationFrame(monthLabelScrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const supabase = createClientSupabase();
    const channel = supabase
      .channel(`ws-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          if (Date.now() < suppressTasksRealtimeUntilRef.current) return;
          scheduleTasksReload();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "release_dates", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          if (Date.now() < suppressReleaseDatesRealtimeUntilRef.current) return;
          scheduleReleaseDatesReload();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, scheduleTasksReload, scheduleReleaseDatesReload]);

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

    if (groupBy === "assignee") {
      const tasksByAssignee = new Map<string, TaskRow[]>();
      for (const task of tasks) {
        const assigneeKey = task.assignee_id ?? UNASSIGNED_ASSIGNEE_GROUP_ID;
        if (!tasksByAssignee.has(assigneeKey)) {
          tasksByAssignee.set(assigneeKey, []);
        }
        tasksByAssignee.get(assigneeKey)?.push(task);
      }

      const sortedAssignees = [...masters.assignees].sort((a, b) => a.sort_order - b.sort_order);
      const assigneeGroups = sortedAssignees.map((assignee) => ({
        id: assignee.id,
        name: assignee.display_name,
        items: tasksByAssignee.get(assignee.id) ?? []
      }));
      const unassignedGroup = {
        id: UNASSIGNED_ASSIGNEE_GROUP_ID,
        name: "未割当",
        items: tasksByAssignee.get(UNASSIGNED_ASSIGNEE_GROUP_ID) ?? []
      };

      return [...assigneeGroups, unassignedGroup];
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
  }, [groupBy, tasks, masters.channels, masters.assignees]);

  const channelIdByName = useMemo(() => {
    return new Map(masters.channels.map((channel) => [channel.name.trim(), channel.id]));
  }, [masters.channels]);

  const taskTypeIdByName = useMemo(() => {
    return new Map(masters.taskTypes.map((taskType) => [taskType.name.trim(), taskType.id]));
  }, [masters.taskTypes]);

  const assigneeIdByName = useMemo(() => {
    return new Map(masters.assignees.map((assignee) => [assignee.display_name.trim(), assignee.id]));
  }, [masters.assignees]);

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
      assigneeId: draft.assigneeId,
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

  const openEditModal = (task: TaskRow) => {
    setEditForm({
      taskId: task.id,
      channelId: task.channel_id,
      scriptNo: task.script_no,
      scriptTitle: task.script_title ?? "",
      taskTypeId: task.task_type_id,
      statusId: task.status_id,
      assigneeId: task.assignee_id ?? "",
      taskName: task.task_name,
      startDate: task.start_date,
      endDate: task.end_date,
      notes: task.notes ?? ""
    });
  };

  const closeEditModal = () => {
    setEditForm(null);
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createForm) return;

    const normalizedScriptNo = createForm.scriptNo.trim();
    const normalizedScriptTitle = createForm.scriptTitle.trim();

    try {
      const created = await fetchJson<TaskRow>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          channelId: createForm.channelId,
          scriptNo: normalizedScriptNo || undefined,
          scriptTitle: normalizedScriptTitle || undefined,
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
      suppressTasksRealtime();
      upsertTaskInState(created);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "タスク作成に失敗しました");
    }
  };

  const parseBulkInput = () => {
    const year = Number(bulkImportYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { error: "年は 2000〜2100 の範囲で指定してください。" };
    }

    const parsed = parseBulkImportText(bulkImportText, year);
    if (!parsed.rows.length && parsed.errors.length) {
      return { error: parsed.errors.join("\n") };
    }
    if (!parsed.rows.length) {
      return { error: "取り込める行がありません。" };
    }

    return { parsed };
  };

  const resolveAssigneesForBulkRows = async (rows: BulkImportRow[]) => {
    const warnings: string[] = [];
    const errors: string[] = [];
    const requiredAssigneeNames = Array.from(
      new Set(
        rows
          .map((row) => row.assigneeName.trim())
          .filter((name) => name.length > 0)
      )
    );

    let assigneeMap = new Map(assigneeIdByName);
    const missingNames = requiredAssigneeNames.filter((name) => !assigneeMap.has(name));

    if (!missingNames.length) {
      return { assigneeMap, warnings, errors };
    }

    if (!canAdmin) {
      errors.push(`未登録の担当者があります: ${missingNames.join(" / ")} (管理者で追加してください)`);
      return { assigneeMap, warnings, errors };
    }

    const creationResults = await Promise.allSettled(
      missingNames.map((name) =>
        fetchJson<Assignee>("/api/masters/assignees", {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            name,
            sortOrder: 999,
            isActive: true
          })
        })
      )
    );

    creationResults.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      const name = missingNames[index];
      const message = result.reason instanceof Error ? result.reason.message : "担当者作成に失敗しました";
      if (message.includes("duplicate key")) {
        warnings.push(`担当「${name}」は既に存在しているため再利用します`);
        return;
      }
      errors.push(`担当「${name}」の自動作成に失敗しました: ${message}`);
    });

    const latestAssignees = await fetchJson<Assignee[]>(`/api/masters/assignees?workspaceId=${workspaceId}`);
    assigneeMap = new Map(latestAssignees.map((assignee) => [assignee.display_name.trim(), assignee.id]));
    setMasters((current) => ({ ...current, assignees: latestAssignees }));

    return { assigneeMap, warnings, errors };
  };

  const handleBulkImportTasks = async () => {
    if (bulkImportBusy) return;

    const parsedResult = parseBulkInput();
    if (parsedResult.error) {
      setBulkImportMessage(parsedResult.error);
      return;
    }

    const parsed = parsedResult.parsed;
    if (!parsed) {
      setBulkImportMessage("取り込める行がありません。");
      return;
    }
    const blockingErrors = [...parsed.errors];
    const warnings: string[] = [];
    const importPayloads: { lineNo: number; payload: Record<string, unknown> }[] = [];

    setBulkImportBusy(true);
    setBulkImportMessage("");
    try {
      const assigneeResolution = await resolveAssigneesForBulkRows(parsed.rows);
      warnings.push(...assigneeResolution.warnings);
      blockingErrors.push(...assigneeResolution.errors);

      for (const row of parsed.rows) {
        const channelId = channelIdByName.get(row.channelName.trim());
        if (!channelId) {
          blockingErrors.push(`行${row.lineNo}: チャンネル「${row.channelName}」が見つかりません`);
          continue;
        }

        const taskTypeId = taskTypeIdByName.get(row.taskTypeName.trim());
        if (!taskTypeId) {
          blockingErrors.push(`行${row.lineNo}: タスク種「${row.taskTypeName}」が見つかりません`);
          continue;
        }

        let assigneeId: string | null = null;
        if (row.assigneeName.trim()) {
          assigneeId = assigneeResolution.assigneeMap.get(row.assigneeName.trim()) ?? null;
          if (!assigneeId) {
            blockingErrors.push(`行${row.lineNo}: 担当「${row.assigneeName}」が見つかりません`);
            continue;
          }
        }

        importPayloads.push({
          lineNo: row.lineNo,
          payload: {
            workspaceId,
            channelId,
            scriptNo: row.scriptNo.trim() || undefined,
            taskTypeId,
            assigneeId,
            taskName: row.taskName,
            startDate: row.startDate,
            endDate: row.endDate
          }
        });
      }

      if (!importPayloads.length) {
        const details = blockingErrors.length ? blockingErrors.join("\n") : "取り込める行がありません。";
        setBulkImportMessage(details);
        return;
      }

      const results = await Promise.allSettled(
        importPayloads.map((row) =>
          fetchJson<TaskRow>("/api/tasks", {
            method: "POST",
            body: JSON.stringify(row.payload)
          })
        )
      );

      let successCount = 0;
      const failed: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount += 1;
          return;
        }
        const lineNo = importPayloads[index]?.lineNo;
        const message = result.reason instanceof Error ? result.reason.message : "登録に失敗しました";
        failed.push(`行${lineNo}: ${message}`);
      });

      const summaries = [`追加完了: ${successCount}件 / 失敗: ${failed.length}件`];
      if (blockingErrors.length) summaries.push(...blockingErrors);
      if (warnings.length) summaries.push(...warnings);
      if (failed.length) summaries.push(...failed);

      setBulkImportMessage(summaries.join("\n"));
      if (successCount > 0) {
        await loadTasks();
      }
    } catch (importError) {
      setBulkImportMessage(importError instanceof Error ? importError.message : "一括追加に失敗しました");
    } finally {
      setBulkImportBusy(false);
    }
  };

  const handleBulkAssignToUnassignedTasks = async () => {
    if (bulkImportBusy) return;

    const parsedResult = parseBulkInput();
    if (parsedResult.error) {
      setBulkImportMessage(parsedResult.error);
      return;
    }

    const parsed = parsedResult.parsed;
    if (!parsed) {
      setBulkImportMessage("取り込める行がありません。");
      return;
    }
    const blockingErrors = [...parsed.errors];
    const warnings: string[] = [];

    setBulkImportBusy(true);
    setBulkImportMessage("");
    try {
      const assigneeResolution = await resolveAssigneesForBulkRows(parsed.rows);
      warnings.push(...assigneeResolution.warnings);
      blockingErrors.push(...assigneeResolution.errors);

      const rangeStart = parsed.rows.reduce((min, row) => (row.startDate < min ? row.startDate : min), parsed.rows[0].startDate);
      const rangeEnd = parsed.rows.reduce((max, row) => (row.endDate > max ? row.endDate : max), parsed.rows[0].endDate);

      const taskParams = new URLSearchParams({
        workspaceId,
        sortBy: "start_date_asc",
        rangeStart,
        rangeEnd
      });
      const candidateTasks = await fetchJson<TaskRow[]>(`/api/tasks?${taskParams.toString()}`);
      const unassignedTaskIdsByKey = new Map<string, string[]>();

      for (const task of candidateTasks) {
        if (task.assignee_id !== null) continue;
        const key = buildImportTaskKey({
          channelId: task.channel_id,
          taskTypeId: task.task_type_id,
          taskName: task.task_name,
          startDate: task.start_date,
          endDate: task.end_date,
          scriptNo: task.script_no
        });
        const bucket = unassignedTaskIdsByKey.get(key);
        if (bucket) {
          bucket.push(task.id);
        } else {
          unassignedTaskIdsByKey.set(key, [task.id]);
        }
      }

      const updatePayloads: { lineNo: number; taskId: string; assigneeId: string }[] = [];
      for (const row of parsed.rows) {
        const assigneeName = row.assigneeName.trim();
        if (!assigneeName) continue;

        const channelId = channelIdByName.get(row.channelName.trim());
        if (!channelId) {
          blockingErrors.push(`行${row.lineNo}: チャンネル「${row.channelName}」が見つかりません`);
          continue;
        }

        const taskTypeId = taskTypeIdByName.get(row.taskTypeName.trim());
        if (!taskTypeId) {
          blockingErrors.push(`行${row.lineNo}: タスク種「${row.taskTypeName}」が見つかりません`);
          continue;
        }

        const assigneeId = assigneeResolution.assigneeMap.get(assigneeName);
        if (!assigneeId) {
          blockingErrors.push(`行${row.lineNo}: 担当「${assigneeName}」が見つかりません`);
          continue;
        }

        const key = buildImportTaskKey({
          channelId,
          taskTypeId,
          taskName: row.taskName,
          startDate: row.startDate,
          endDate: row.endDate,
          scriptNo: row.scriptNo
        });
        const bucket = unassignedTaskIdsByKey.get(key);
        const taskId = bucket?.shift();
        if (!taskId) {
          blockingErrors.push(`行${row.lineNo}: 一致する未割当タスクが見つかりません`);
          continue;
        }

        updatePayloads.push({
          lineNo: row.lineNo,
          taskId,
          assigneeId
        });
      }

      if (!updatePayloads.length) {
        const details = blockingErrors.length ? blockingErrors.join("\n") : "更新対象がありません。";
        setBulkImportMessage(details);
        return;
      }

      const results = await Promise.allSettled(
        updatePayloads.map((row) =>
          fetchJson(`/api/tasks/${row.taskId}`, {
            method: "PATCH",
            body: JSON.stringify({
              workspaceId,
              assigneeId: row.assigneeId
            })
          })
        )
      );

      let successCount = 0;
      const failed: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount += 1;
          return;
        }
        const lineNo = updatePayloads[index]?.lineNo;
        const message = result.reason instanceof Error ? result.reason.message : "更新に失敗しました";
        failed.push(`行${lineNo}: ${message}`);
      });

      const summaries = [`担当反映完了: ${successCount}件 / 失敗: ${failed.length}件`];
      if (blockingErrors.length) summaries.push(...blockingErrors);
      if (warnings.length) summaries.push(...warnings);
      if (failed.length) summaries.push(...failed);

      setBulkImportMessage(summaries.join("\n"));
      if (successCount > 0) {
        await loadTasks();
      }
    } catch (error) {
      setBulkImportMessage(error instanceof Error ? error.message : "担当反映に失敗しました");
    } finally {
      setBulkImportBusy(false);
    }
  };

  const handlePatchTask = async (taskId: string, patch: Record<string, unknown>) => {
    try {
      const updated = await fetchJson<TaskRow>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, ...patch })
      });
      suppressTasksRealtime();
      upsertTaskInState(updated);
      return true;
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "タスク更新に失敗しました");
      return false;
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return false;

    try {
      await fetchJson(`/api/tasks/${taskId}?workspaceId=${workspaceId}`, {
        method: "DELETE"
      });
      suppressTasksRealtime();
      removeTaskFromState(taskId);
      return true;
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "タスク削除に失敗しました");
      return false;
    }
  };

  const handleSaveReleaseDate = async () => {
    try {
      const saved = await fetchJson<ReleaseDateRow>("/api/release-dates", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          channelId: releaseForm.channelId,
          scriptNo: releaseForm.scriptNo,
          releaseDate: releaseForm.releaseDate,
          label: releaseForm.label || undefined
        })
      });
      setReleaseForm((current) => ({ ...current, scriptNo: "", label: "" }));
      suppressReleaseDatesRealtime();
      upsertReleaseDateInState(saved);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "公開日更新に失敗しました");
    }
  };

  const handlePatchReleaseDate = async (id: string, patch: { releaseDate?: string; label?: string | null }) => {
    try {
      const updated = await fetchJson<ReleaseDateRow>("/api/release-dates", {
        method: "PATCH",
        body: JSON.stringify({
          workspaceId,
          id,
          ...patch
        })
      });
      suppressReleaseDatesRealtime();
      upsertReleaseDateInState(updated);
      return true;
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "公開日更新に失敗しました");
      return false;
    }
  };

  const handleDeleteReleaseDate = async (id: string) => {
    if (!window.confirm("この公開日を削除しますか？")) return false;

    try {
      await fetchJson("/api/release-dates", {
        method: "DELETE",
        body: JSON.stringify({
          workspaceId,
          id
        })
      });
      suppressReleaseDatesRealtime();
      removeReleaseDateFromState(id);
      return true;
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "公開日削除に失敗しました");
      return false;
    }
  };

  const createMaster = async (
    resource: MasterResource,
    name: string,
    options?: { sortOrder?: number; isActive?: boolean; isDone?: boolean }
  ) => {
    if (!name.trim()) return;
    try {
      await fetchJson(`/api/masters/${resource}`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          ...options
        })
      });
      await loadMasters();
    } catch (masterError) {
      setError(masterError instanceof Error ? masterError.message : "マスター作成に失敗しました");
      throw masterError;
    }
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

  const patchMasterRequest = useCallback(
    async (resource: MasterResource, id: string, patch: Record<string, unknown>) => {
      await fetchJson(`/api/masters/${resource}`, {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, id, ...patch })
      });
    },
    [workspaceId]
  );

  const patchMaster = async (
    resource: MasterResource,
    id: string,
    patch: Record<string, unknown>
  ) => {
    try {
      await patchMasterRequest(resource, id, patch);
      await loadMasters();
    } catch (masterError) {
      setError(masterError instanceof Error ? masterError.message : "マスター更新に失敗しました");
      throw masterError;
    }
  };

  const reorderMasters = useCallback(
    async (resource: MasterResource, orderedIds: string[]) => {
      const currentRows =
        resource === "channels"
          ? masters.channels.map((row) => ({ id: row.id, sortOrder: row.sort_order }))
          : resource === "task_types"
            ? masters.taskTypes.map((row) => ({ id: row.id, sortOrder: row.sort_order }))
            : resource === "task_statuses"
              ? masters.taskStatuses.map((row) => ({ id: row.id, sortOrder: row.sort_order }))
              : masters.assignees.map((row) => ({ id: row.id, sortOrder: row.sort_order }));

      const patches = buildSortOrderPatches(currentRows, orderedIds);
      if (!patches.length) return;

      try {
        await Promise.all(
          patches.map((patch) =>
            patchMasterRequest(resource, patch.id, {
              sortOrder: patch.sortOrder
            })
          )
        );
        await loadMasters();
      } catch (masterError) {
        setError(masterError instanceof Error ? masterError.message : "マスター更新に失敗しました");
        throw masterError;
      }
    },
    [loadMasters, masters.assignees, masters.channels, masters.taskStatuses, masters.taskTypes, patchMasterRequest]
  );

  const deleteMaster = async (resource: MasterResource, id: string) => {
    try {
      await fetchJson(`/api/masters/${resource}`, {
        method: "DELETE",
        body: JSON.stringify({ workspaceId, id })
      });
      await loadMasters();
    } catch (masterError) {
      setError(masterError instanceof Error ? masterError.message : "マスター削除に失敗しました");
      throw masterError;
    }
  };

  const visibleReleaseDates = useMemo(() => {
    return releaseDates.filter((releaseDate) => {
      if (filters.channelId !== "all" && releaseDate.channel_id !== filters.channelId) {
        return false;
      }
      return true;
    });
  }, [releaseDates, filters.channelId]);

  const releaseByChannel = useMemo(() => {
    const map = new Map<string, ReleaseDateRow[]>();
    for (const releaseDate of visibleReleaseDates) {
      if (!map.has(releaseDate.channel_id)) {
        map.set(releaseDate.channel_id, []);
      }
      map.get(releaseDate.channel_id)?.push(releaseDate);
    }
    return map;
  }, [visibleReleaseDates]);

  const timelineDayCells = useMemo<TimelineDayCell[]>(
    () =>
      timelineDates.map((date) => ({
        date,
        dayLabel: toDayLabel(date),
        weekdayLabel: toWeekdayLabel(date),
        monthKey: format(parseISO(date), "yyyy-MM"),
        monthLabel: toMonthLabel(date),
        isNonWorkingDay: isNonWorkingDay(date),
        isToday: date === todayDate
      })),
    [timelineDates, todayDate]
  );

  const timelineMonthGroups = useMemo<TimelineMonthGroup[]>(() => {
    const groups: TimelineMonthGroup[] = [];
    for (let index = 0; index < timelineDayCells.length; index += 1) {
      const dayCell = timelineDayCells[index];
      const current = groups[groups.length - 1];
      if (current && current.key === dayCell.monthKey) {
        current.length += 1;
      } else {
        groups.push({
          key: dayCell.monthKey,
          label: dayCell.monthLabel,
          startIndex: index,
          length: 1
        });
      }
    }
    return groups;
  }, [timelineDayCells]);

  const releaseBandRows = useMemo<ChannelReleaseBandRow[]>(() => {
    const sortedChannels = [...masters.channels].sort((a, b) => a.sort_order - b.sort_order);
    const scopedChannels =
      filters.channelId === "all" ? sortedChannels : sortedChannels.filter((channel) => channel.id === filters.channelId);
    const channelsWithRelease = new Set(visibleReleaseDates.map((releaseDate) => releaseDate.channel_id));
    const rows = scopedChannels.filter((channel) => channelsWithRelease.has(channel.id));

    if (!rows.length) {
      return [
        {
          channelId: "none",
          label: "公開日なし",
          tone: "#f4f1ea",
          maxStack: 1,
          height: RELEASE_BAND_ROW_HEIGHT,
          placeholder: true
        }
      ];
    }

    return rows.map((channel, index) => {
      const perDateCount = new Map<string, number>();
      for (const releaseDate of visibleReleaseDates) {
        if (releaseDate.channel_id !== channel.id) continue;
        const nextCount = (perDateCount.get(releaseDate.release_date) ?? 0) + 1;
        perDateCount.set(releaseDate.release_date, nextCount);
      }

      const maxStack = Math.max(1, ...perDateCount.values());

      return {
        channelId: channel.id,
        label: `${channel.name} 投稿日`,
        tone: RELEASE_ROW_TONES[index % RELEASE_ROW_TONES.length],
        maxStack,
        height: RELEASE_BAND_ROW_HEIGHT * maxStack
      };
    });
  }, [masters.channels, visibleReleaseDates, filters.channelId]);

  const releaseBandCellMap = useMemo(() => {
    const map = new Map<string, ReleaseDateRow[]>();
    for (const releaseDate of visibleReleaseDates) {
      const key = `${releaseDate.channel_id}:${releaseDate.release_date}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(releaseDate);
    }
    return map;
  }, [visibleReleaseDates]);

  const releaseBandHeight = releaseBandRows.reduce((sum, row) => sum + row.height, 0);
  const calendarHeaderHeight = MONTH_ROW_HEIGHT + DAY_ROW_HEIGHT + WEEKDAY_ROW_HEIGHT;
  const timelineHeaderHeight = releaseBandHeight + calendarHeaderHeight;

  const handleSaveTaskEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editForm) return;

    const updated = await handlePatchTask(editForm.taskId, {
      channelId: editForm.channelId,
      scriptNo: editForm.scriptNo.trim(),
      scriptTitle: editForm.scriptTitle.trim() || undefined,
      taskTypeId: editForm.taskTypeId,
      statusId: editForm.statusId,
      assigneeId: editForm.assigneeId || null,
      taskName: editForm.taskName,
      startDate: editForm.startDate,
      endDate: editForm.endDate,
      notes: editForm.notes || null
    });

    if (updated) {
      closeEditModal();
    }
  };

  const barRange = (task: TaskRow) => {
    const preview = barPreview[task.id];
    const startDate = preview?.startDate ?? task.start_date;
    const endDate = preview?.endDate ?? task.end_date;

    if (!timelineDates.length) {
      return { startIndex: 0, endIndex: 0, startDate, endDate };
    }

    const lastIndex = timelineDates.length - 1;
    const toIndex = (date: string) => {
      if (date <= rangeStart) return 0;
      if (date >= rangeEnd) return lastIndex;
      return clamp(dateToIndex.get(date) ?? 0, 0, lastIndex);
    };

    const rawStartIndex = toIndex(startDate);
    const rawEndIndex = toIndex(endDate);

    return {
      startIndex: Math.min(rawStartIndex, rawEndIndex),
      endIndex: Math.max(rawStartIndex, rawEndIndex),
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
    const baseStartIndex = interaction.baseStartIndex;
    const baseEndIndex = interaction.baseEndIndex;
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
    <main
      className="app-shell"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr)",
        height: "100dvh",
        minHeight: 0,
        alignContent: "stretch",
        gap: 14
      }}
    >
      <section
        className="card"
        style={{ padding: 16, display: "grid", gap: 12, minWidth: 0, minHeight: TOP_PANEL_MIN_HEIGHT, alignContent: "start" }}
      >
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
            <button
              type="button"
              className={viewTab === "schedule" ? "primary" : undefined}
              onClick={() => setViewTab("schedule")}
            >
              スケジュール
            </button>
            <button
              type="button"
              className={viewTab === "masters" ? "primary" : undefined}
              onClick={() => setViewTab("masters")}
            >
              マスター管理
            </button>
            {viewTab === "schedule" ? (
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setBulkImportMessage("");
                  setBulkImportOpen(true);
                }}
              >
                データ一括追加
              </button>
            ) : null}
          </div>
        </div>

        {viewTab === "schedule" ? (
          <div style={{ display: "grid", gap: 8, minHeight: TOP_PANEL_DETAIL_MIN_HEIGHT, alignContent: "start" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Group
                <select
                  value={groupBy}
                  onChange={(event) => setGroupBy(event.target.value as GroupBy)}
                  style={{ marginLeft: 6 }}
                >
                  <option value="channel">チャンネル</option>
                  <option value="assignee">担当者</option>
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
          </div>
        ) : (
          <div className="muted" style={{ minHeight: TOP_PANEL_DETAIL_MIN_HEIGHT, display: "flex", alignItems: "center" }}>
            公開日と各種マスターをテーブル形式でCRUDできます。
          </div>
        )}

        {error ? (
          <div className="card" style={{ padding: 10, color: "var(--danger)", borderColor: "#d8bbbb" }}>
            {error}
          </div>
        ) : null}
      </section>

      {viewTab === "schedule" ? (
      <section className="card" style={{ overflow: "hidden", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          ref={scheduleScrollRef}
          onScroll={(event) => {
            handleScheduleScroll(event.currentTarget.scrollLeft);
          }}
          style={{
            overflow: "auto",
            flex: 1,
            minHeight: 0,
            scrollbarGutter: "stable",
            paddingBottom: 12,
            background: "#fff"
          }}
        >
          <div style={{ minWidth: LEFT_WIDTH + totalTimelineWidth }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${LEFT_WIDTH}px ${totalTimelineWidth}px`,
                borderBottom: "1px solid var(--line)"
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: `${releaseBandHeight}px ${calendarHeaderHeight}px`,
                  height: timelineHeaderHeight,
                  background: "var(--panel-muted)",
                  borderRight: "1px solid var(--line)",
                  position: "sticky",
                  left: 0,
                  zIndex: 12
                }}
              >
                <div style={{ borderBottom: "1px solid var(--line)" }}>
                  {releaseBandRows.map((row, rowIndex) => (
                    <div
                      key={`left-release-${row.channelId}-${rowIndex}`}
                      style={{
                        height: row.height,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 10px",
                        fontSize: 10,
                        fontWeight: 700,
                        background: row.tone,
                        borderTop: rowIndex === 0 ? "none" : "1px solid rgba(125, 118, 102, 0.35)",
                        borderRight: "1px solid var(--line)",
                        color: row.placeholder ? "var(--text-muted)" : "#2d2a23",
                        lineHeight: "14px"
                      }}
                    >
                      {row.label}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: LEFT_GRID_TEMPLATE,
                    alignItems: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "0 10px",
                    gap: TABLE_GAP
                  }}
                >
                  <span>チャンネル</span>
                  <span>担当</span>
                  <span>脚本番号</span>
                  <span>タスク種</span>
                  <span>タスク名</span>
                  <span>開始日</span>
                  <span>終了日</span>
                  <span>操作</span>
                </div>
              </div>

              <div style={{ width: totalTimelineWidth, background: "var(--panel-muted)" }}>
                <div
                  style={{
                    width: totalTimelineWidth,
                    height: releaseBandHeight,
                    borderBottom: "1px solid var(--line)"
                  }}
                >
                  {releaseBandRows.map((row, rowIndex) => (
                    <div
                      key={`release-row-${row.channelId}-${rowIndex}`}
                      style={{
                        display: "flex",
                        width: totalTimelineWidth,
                        height: row.height,
                        borderTop: rowIndex === 0 ? "none" : "1px solid rgba(125, 118, 102, 0.35)",
                        background: row.tone
                      }}
                    >
                      {timelineDayCells.map((dayCell) => {
                        const releases = row.placeholder
                          ? []
                          : (releaseBandCellMap.get(`${row.channelId}:${dayCell.date}`) ?? []);
                        const title = releases
                          .map((release) =>
                            `${release.script_no}${release.label ? ` (${release.label})` : ""} ${release.release_date}`
                          )
                          .join(", ");

                        return (
                          <div
                            key={`release-cell-${row.channelId}-${dayCell.date}`}
                            title={title || undefined}
                            style={{
                              width: DAY_WIDTH,
                              borderLeft: "1px solid rgba(122, 116, 101, 0.35)",
                              height: row.height,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              alignItems: "center",
                              gap: 0,
                              padding: "0 1px"
                            }}
                          >
                            {releases.map((release) => (
                              <span
                                key={release.id}
                                style={{
                                  whiteSpace: "nowrap",
                                  fontSize: 8,
                                  lineHeight: "11px",
                                  color: "#2d3c62",
                                  fontWeight: 700
                                }}
                              >
                                {release.script_no}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    width: totalTimelineWidth,
                    height: MONTH_ROW_HEIGHT,
                    background: "#7f95b7",
                    borderBottom: "1px solid var(--line)"
                  }}
                >
                  <span
                    ref={timelineMonthBadgeRef}
                    style={{
                      position: "absolute",
                      left: 6,
                      top: 3,
                      zIndex: 4,
                      height: MONTH_ROW_HEIGHT - 6,
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0 7px",
                      borderRadius: 4,
                      background: "rgba(37, 54, 82, 0.75)",
                      color: "#f5f8ff",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: "12px",
                      pointerEvents: "none"
                    }}
                  >
                    {visibleMonthLabel}
                  </span>
                  {timelineMonthGroups.map((monthGroup) => (
                    <div
                      key={`month-group-${monthGroup.key}`}
                      style={{
                        width: monthGroup.length * DAY_WIDTH,
                        borderLeft: "1px solid rgba(255, 255, 255, 0.35)",
                        color: "#f5f8ff",
                        fontSize: 10,
                        fontWeight: 700,
                        position: "relative",
                        overflow: "hidden"
                      }}
                    >
                      <span
                        style={{
                          position: "sticky",
                          left: 2,
                          top: 0,
                          display: "inline-block",
                          lineHeight: `${MONTH_ROW_HEIGHT}px`,
                          paddingRight: 4
                        }}
                      >
                        {monthGroup.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    width: totalTimelineWidth,
                    height: DAY_ROW_HEIGHT,
                    background: "#e6edf8",
                    borderBottom: "1px solid var(--line)"
                  }}
                >
                  {timelineDayCells.map((dayCell) => (
                    <div
                      key={`day-label-${dayCell.date}`}
                      style={{
                        width: DAY_WIDTH,
                        borderLeft: "1px solid rgba(122, 132, 146, 0.35)",
                        fontSize: 10,
                        color: "#2e3745",
                        fontWeight: 700,
                        display: "grid",
                        placeItems: "center",
                        background: dayCell.isToday ? TODAY_COLUMN_BG : "transparent"
                      }}
                    >
                      {dayCell.dayLabel}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    width: totalTimelineWidth,
                    height: WEEKDAY_ROW_HEIGHT,
                    background: "#f1f4f8",
                    borderBottom: "1px solid var(--line)"
                  }}
                >
                  {timelineDayCells.map((dayCell) => (
                    <div
                      key={`weekday-label-${dayCell.date}`}
                      style={{
                        width: DAY_WIDTH,
                        borderLeft: "1px solid rgba(132, 140, 151, 0.3)",
                        fontSize: 9,
                        color: "#4b5565",
                        fontWeight: 700,
                        display: "grid",
                        placeItems: "center",
                        background: dayCell.isToday ? TODAY_COLUMN_BG : "transparent"
                      }}
                    >
                      {dayCell.weekdayLabel}
                    </div>
                  ))}
                </div>
              </div>
            </div>

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
              const releases = groupBy === "channel" ? (releaseByChannel.get(group.id) ?? []) : [];

              return (
                <div key={group.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `${LEFT_WIDTH}px ${totalTimelineWidth}px`,
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
                        zIndex: 6
                      }}
                    >
                      <strong>{group.name}</strong>
                      <span className="muted" style={{ marginLeft: 8 }}>
                        {group.items.length} tasks
                      </span>
                    </div>
                    <div style={{ padding: "8px 10px" }} className="muted">
                      {groupBy === "channel"
                        ? releases.length
                          ? `${releases.length}件の公開日マーカー`
                          : "公開日マーカーなし"
                        : "公開日マーカーはチャンネル単位"}
                    </div>
                  </div>

                  {group.items.map((task) => {
                    const range = barRange(task);

                    return (
                      <div
                        key={task.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: `${LEFT_WIDTH}px ${totalTimelineWidth}px`,
                          height: TASK_ROW_HEIGHT
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: LEFT_GRID_TEMPLATE,
                            alignItems: "center",
                            padding: "0 10px",
                            gap: TABLE_GAP,
                            borderRight: "1px solid var(--line)",
                            borderTop: `1px solid ${TIMELINE_GRID_BORDER}`,
                            position: "sticky",
                            left: 0,
                            background: "#fff",
                            zIndex: 5,
                            overflow: "hidden",
                            fontSize: 11
                          }}
                        >
                          <span>{task.channel_name}</span>
                          <span>{task.assignee_name ?? "未割当"}</span>
                          <span>{task.script_no}</span>
                          <span>{task.task_type_name}</span>
                          <span title={task.task_name} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {task.task_name}
                          </span>
                          <span>{toMonthDayLabel(range.startDate)}</span>
                          <span>{toMonthDayLabel(range.endDate)}</span>
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => {
                              openEditModal(task);
                            }}
                            style={{ padding: "2px 6px", fontSize: 10, lineHeight: "14px" }}
                          >
                            編集
                          </button>
                        </div>

                        <div
                          style={{ position: "relative" }}
                          onPointerMove={(event) => {
                            if (!barInteraction) return;
                            if (barInteraction.pointerId !== event.pointerId) return;

                            const lane = event.currentTarget;
                            const index = indexFromPointer(event, lane);
                            applyBarPreview(barInteraction, index);
                            if (index !== barInteraction.lastIndex) {
                              setBarInteraction((current) =>
                                current && current.pointerId === event.pointerId
                                  ? { ...current, moved: true, lastIndex: index }
                                  : current
                              );
                            }
                          }}
                          onPointerUp={(event) => {
                            if (!barInteraction) return;
                            if (barInteraction.pointerId !== event.pointerId) return;

                            void commitBarPreview(barInteraction.taskId);
                            if (barInteraction.moved) {
                              suppressBarClickTaskIdRef.current = barInteraction.taskId;
                              requestAnimationFrame(() => {
                                if (suppressBarClickTaskIdRef.current === barInteraction.taskId) {
                                  suppressBarClickTaskIdRef.current = null;
                                }
                              });
                            }
                            setBarInteraction(null);
                          }}
                        >
                          <div style={{ position: "relative", width: totalTimelineWidth, height: TASK_ROW_HEIGHT }}>
                            {timelineDayCells.map((dayCell) => (
                              <div
                                key={`${task.id}-${dayCell.date}`}
                                style={{
                                  position: "absolute",
                                  left: (dateToIndex.get(dayCell.date) ?? 0) * DAY_WIDTH,
                                  top: 0,
                                  bottom: 0,
                                  width: DAY_WIDTH,
                                  borderLeft: `1px solid ${TIMELINE_GRID_BORDER}`,
                                  borderTop: `1px solid ${TIMELINE_GRID_BORDER}`,
                                  background: dayCell.isToday
                                    ? TODAY_COLUMN_BG
                                    : dayCell.isNonWorkingDay
                                      ? NON_WORKING_DAY_BG
                                      : "transparent"
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
                              tabIndex={0}
                              onClick={() => {
                                if (!canWrite) return;
                                if (suppressBarClickTaskIdRef.current === task.id) return;
                                openEditModal(task);
                              }}
                              onPointerDown={(event) => {
                                if (!canWrite) return;
                                const lane = event.currentTarget.parentElement as HTMLElement;
                                const index = indexFromPointer(event, lane);
                                const pointerId = event.pointerId;
                                lane.setPointerCapture(pointerId);
                                const offset = index - range.startIndex;
                                setBarInteraction({
                                  taskId: task.id,
                                  type: "move",
                                  pointerId,
                                  baseStartIndex: range.startIndex,
                                  baseEndIndex: range.endIndex,
                                  offsetDays: offset,
                                  moved: false,
                                  lastIndex: index
                                });
                              }}
                              style={{
                                position: "absolute",
                                top: Math.max(1, Math.floor((TASK_ROW_HEIGHT - BAR_HEIGHT) / 2)),
                                left: range.startIndex * DAY_WIDTH + 2,
                                width: Math.max(DAY_WIDTH - 4, (range.endIndex - range.startIndex + 1) * DAY_WIDTH - 4),
                                height: BAR_HEIGHT,
                                borderRadius: 5,
                                background: "linear-gradient(120deg, #4b8aff, #2b66d7)",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 6px",
                                fontSize: 10,
                                cursor: canWrite ? "grab" : "default",
                                userSelect: "none",
                                overflow: "hidden",
                                border: "1px solid rgba(255,255,255,0.15)"
                              }}
                            >
                              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.task_name}</span>
                              <span
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  if (!canWrite) return;
                                  const lane = (event.currentTarget.parentElement?.parentElement as HTMLElement) ?? null;
                                  if (!lane) return;
                                  const pointerId = event.pointerId;
                                  const index = indexFromPointer(event, lane);
                                  lane.setPointerCapture(pointerId);
                                  setBarInteraction({
                                    taskId: task.id,
                                    type: "resize-start",
                                    pointerId,
                                    baseStartIndex: range.startIndex,
                                    baseEndIndex: range.endIndex,
                                    offsetDays: 0,
                                    moved: false,
                                    lastIndex: index
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
                                  const index = indexFromPointer(event, lane);
                                  lane.setPointerCapture(pointerId);
                                  setBarInteraction({
                                    taskId: task.id,
                                    type: "resize-end",
                                    pointerId,
                                    baseStartIndex: range.startIndex,
                                    baseEndIndex: range.endIndex,
                                    offsetDays: 0,
                                    moved: false,
                                    lastIndex: index
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
                      gridTemplateColumns: `${LEFT_WIDTH}px ${totalTimelineWidth}px`,
                      height: CREATE_ROW_HEIGHT,
                      background: "#fdfcf8"
                    }}
                  >
                  <div
                    className="muted"
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                        borderRight: "1px solid var(--line)",
                        borderTop: `1px solid ${TIMELINE_GRID_BORDER}`,
                        position: "sticky",
                        left: 0,
                        background: "#fdfcf8",
                        zIndex: 4
                      }}
                    >
                      + ドラッグして新規タスク作成
                    </div>
                    <div
                      style={{ position: "relative" }}
                      onPointerDown={(event) => {
                        if (!canWrite) return;
                        const draftChannelId =
                          groupBy === "channel"
                            ? group.id
                            : filters.channelId !== "all"
                              ? filters.channelId
                              : (masters.channels[0]?.id ?? "");
                        if (!draftChannelId) return;
                        const lane = event.currentTarget;
                        const index = indexFromPointer(event, lane);
                        lane.setPointerCapture(event.pointerId);
                        setLaneInteraction({
                          laneKey: group.id,
                          channelId: draftChannelId,
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
                        const assigneeId =
                          groupBy === "assignee"
                            ? group.id === UNASSIGNED_ASSIGNEE_GROUP_ID
                              ? ""
                              : group.id
                            : filters.assigneeId === "all"
                              ? ""
                              : filters.assigneeId;
                        const channelId = laneInteraction.channelId;
                        if (!channelId) {
                          setLaneInteraction(null);
                          return;
                        }
                        openCreateModal({
                          channelId,
                          assigneeId,
                          startDate: timelineDates[startIndex],
                          endDate: timelineDates[endIndex]
                        });
                        setLaneInteraction(null);
                      }}
                    >
                      <div style={{ position: "relative", width: totalTimelineWidth, height: CREATE_ROW_HEIGHT }}>
                        {timelineDayCells.map((dayCell) => (
                          <div
                            key={`create-${group.id}-${dayCell.date}`}
                            style={{
                              position: "absolute",
                              left: (dateToIndex.get(dayCell.date) ?? 0) * DAY_WIDTH,
                              width: DAY_WIDTH,
                              top: 0,
                              bottom: 0,
                              borderLeft: `1px solid ${TIMELINE_GRID_BORDER}`,
                              borderTop: `1px solid ${TIMELINE_GRID_BORDER}`,
                              background: dayCell.isToday
                                ? TODAY_COLUMN_BG
                                : dayCell.isNonWorkingDay
                                  ? NON_WORKING_DAY_BG
                                  : "transparent"
                            }}
                          />
                        ))}

                        {laneInteraction && laneInteraction.laneKey === group.id ? (
                          <div
                            style={{
                              position: "absolute",
                              left: Math.min(laneInteraction.anchorIndex, laneInteraction.currentIndex) * DAY_WIDTH + 2,
                              top: Math.max(1, Math.floor((CREATE_ROW_HEIGHT - BAR_HEIGHT) / 2)),
                              height: BAR_HEIGHT,
                              width:
                                (Math.max(laneInteraction.anchorIndex, laneInteraction.currentIndex) -
                                  Math.min(laneInteraction.anchorIndex, laneInteraction.currentIndex) +
                                  1) *
                                  DAY_WIDTH -
                                4,
                              borderRadius: 4,
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
        </div>
      </section>
      ) : null}

      {viewTab === "masters" ? (
        <section
          className="card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, minHeight: 0 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>マスター管理</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              タブを切り替えて各マスターをテーブルで操作できます。
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={masterTab === "release_dates" ? "primary" : undefined} onClick={() => setMasterTab("release_dates")}>
              公開日
            </button>
            <button type="button" className={masterTab === "channels" ? "primary" : undefined} onClick={() => setMasterTab("channels")}>
              チャンネル
            </button>
            <button type="button" className={masterTab === "task_types" ? "primary" : undefined} onClick={() => setMasterTab("task_types")}>
              タスク種
            </button>
            <button type="button" className={masterTab === "assignees" ? "primary" : undefined} onClick={() => setMasterTab("assignees")}>
              担当者
            </button>
            <button
              type="button"
              className={masterTab === "task_statuses" ? "primary" : undefined}
              onClick={() => setMasterTab("task_statuses")}
            >
              タスクステータス
            </button>
            <button type="button" className={masterTab === "members" ? "primary" : undefined} onClick={() => setMasterTab("members")}>
              ロール
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", scrollbarGutter: "stable", paddingBottom: 6 }}>
            {masterTab === "release_dates" ? (
              <ReleaseDateTable
                canEdit={canWrite}
                channels={masters.channels}
                releaseDates={releaseDates}
                releaseForm={releaseForm}
                onReleaseFormChange={setReleaseForm}
                onCreate={handleSaveReleaseDate}
                onSave={handlePatchReleaseDate}
                onDelete={handleDeleteReleaseDate}
              />
            ) : null}

            {masterTab === "channels" ? (
              <MasterTableEditor
                title="チャンネル"
                canEdit={canAdmin}
                toggleLabel="有効"
                enableSortOrder
                createToggleDefault
                rows={masters.channels.map((channel) => ({
                  id: channel.id,
                  name: channel.name,
                  sortOrder: channel.sort_order,
                  toggle: channel.is_active
                }))}
                onCreate={async ({ name, toggle }) =>
                  createMaster("channels", name, {
                    sortOrder: getNextSortOrder(masters.channels.map((channel) => channel.sort_order)),
                    isActive: toggle
                  })
                }
                onReorder={async (orderedIds) => reorderMasters("channels", orderedIds)}
                onSave={async (id, patch) =>
                  patchMaster("channels", id, {
                    name: patch.name,
                    sortOrder: patch.sortOrder,
                    isActive: patch.toggle
                  })
                }
                onDelete={async (id) => deleteMaster("channels", id)}
              />
            ) : null}

            {masterTab === "task_types" ? (
              <MasterTableEditor
                title="タスク種"
                canEdit={canAdmin}
                toggleLabel="有効"
                enableSortOrder
                createToggleDefault
                rows={masters.taskTypes.map((taskType) => ({
                  id: taskType.id,
                  name: taskType.name,
                  sortOrder: taskType.sort_order,
                  toggle: taskType.is_active
                }))}
                onCreate={async ({ name, toggle }) =>
                  createMaster("task_types", name, {
                    sortOrder: getNextSortOrder(masters.taskTypes.map((taskType) => taskType.sort_order)),
                    isActive: toggle
                  })
                }
                onReorder={async (orderedIds) => reorderMasters("task_types", orderedIds)}
                onSave={async (id, patch) =>
                  patchMaster("task_types", id, {
                    name: patch.name,
                    sortOrder: patch.sortOrder,
                    isActive: patch.toggle
                  })
                }
                onDelete={async (id) => deleteMaster("task_types", id)}
              />
            ) : null}

            {masterTab === "assignees" ? (
              <MasterTableEditor
                title="担当者"
                canEdit={canAdmin}
                toggleLabel="有効"
                enableSortOrder
                createToggleDefault
                rows={masters.assignees.map((assignee) => ({
                  id: assignee.id,
                  name: assignee.display_name,
                  sortOrder: assignee.sort_order,
                  toggle: assignee.is_active
                }))}
                onCreate={async ({ name, toggle }) =>
                  createMaster("assignees", name, {
                    sortOrder: getNextSortOrder(masters.assignees.map((assignee) => assignee.sort_order)),
                    isActive: toggle
                  })
                }
                onReorder={async (orderedIds) => reorderMasters("assignees", orderedIds)}
                onSave={async (id, patch) =>
                  patchMaster("assignees", id, {
                    name: patch.name,
                    sortOrder: patch.sortOrder,
                    isActive: patch.toggle
                  })
                }
                onDelete={async (id) => deleteMaster("assignees", id)}
              />
            ) : null}

            {masterTab === "task_statuses" ? (
              <MasterTableEditor
                title="タスクステータス"
                canEdit={canAdmin}
                toggleLabel="完了扱い"
                enableSortOrder
                rows={masters.taskStatuses.map((status) => ({
                  id: status.id,
                  name: status.name,
                  sortOrder: status.sort_order,
                  toggle: status.is_done
                }))}
                onCreate={async ({ name, toggle }) =>
                  createMaster("task_statuses", name, {
                    sortOrder: getNextSortOrder(masters.taskStatuses.map((status) => status.sort_order)),
                    isDone: toggle
                  })
                }
                onReorder={async (orderedIds) => reorderMasters("task_statuses", orderedIds)}
                onSave={async (id, patch) =>
                  patchMaster("task_statuses", id, {
                    name: patch.name,
                    sortOrder: patch.sortOrder,
                    isDone: patch.toggle
                  })
                }
                onDelete={async (id) => deleteMaster("task_statuses", id)}
              />
            ) : null}

            {masterTab === "members" ? (
              <MemberRoleTable canEdit={canAdmin} members={members} onUpdateRole={updateMemberRole} />
            ) : null}
          </div>
        </section>
      ) : null}

      {bulkImportOpen ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !bulkImportBusy) {
              setBulkImportOpen(false);
            }
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleBulkImportTasks();
            }}
            className="card modal-panel"
            style={{ display: "grid", gap: 10, width: 820, maxWidth: "calc(100vw - 32px)" }}
          >
            <h3 style={{ margin: 0 }}>データ一括追加（タブ区切り）</h3>
            <div className="muted" style={{ fontSize: 13 }}>
              列順: チャンネル / 担当 / 脚本番号(任意) / タスク種 / タスク名 / 開始日 / 終了日
            </div>
            <label style={{ display: "grid", gap: 4, width: 180 }}>
              年（M月D日入力時に使用）
              <input
                type="number"
                min={2000}
                max={2100}
                value={bulkImportYear}
                disabled={bulkImportBusy}
                onChange={(event) => setBulkImportYear(event.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              データ
              <textarea
                rows={14}
                value={bulkImportText}
                disabled={bulkImportBusy}
                onChange={(event) => setBulkImportText(event.target.value)}
                placeholder="ペケッツ[TAB]東雲[TAB]755[TAB]イラスト[TAB]タイトル[TAB]1月6日 (火)[TAB]1月10日 (土)"
              />
            </label>
            {bulkImportMessage ? (
              <pre
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "#faf9f5",
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  maxHeight: 220,
                  overflow: "auto"
                }}
              >
                {bulkImportMessage}
              </pre>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" disabled={bulkImportBusy} onClick={() => setBulkImportOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                disabled={!canWrite || bulkImportBusy}
                onClick={() => {
                  void handleBulkAssignToUnassignedTasks();
                }}
              >
                未割当に担当反映
              </button>
              <button className="primary" type="submit" disabled={!canWrite || bulkImportBusy}>
                {bulkImportBusy ? "追加中..." : "一括追加"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {createForm && createDraft ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <form onSubmit={handleCreateTask} className="card modal-panel" style={{ display: "grid", gap: 10, width: 720 }}>
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
                脚本番号（任意）
                <input
                  value={createForm.scriptNo}
                  placeholder="空欄可"
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
        </div>
      ) : null}

      {editForm ? (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEditModal();
            }
          }}
        >
          <form onSubmit={handleSaveTaskEdit} className="card modal-panel" style={{ display: "grid", gap: 10, width: 720 }}>
            <h3 style={{ margin: 0 }}>タスク編集</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                チャンネル
                <select
                  value={editForm.channelId}
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, channelId: event.target.value } : current))
                  }
                >
                  {masters.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                脚本番号（任意）
                <input
                  value={editForm.scriptNo}
                  placeholder="空欄可"
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, scriptNo: event.target.value } : current))
                  }
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              脚本タイトル
              <input
                value={editForm.scriptTitle}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, scriptTitle: event.target.value } : current))
                }
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              タスク名
              <input
                value={editForm.taskName}
                required
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, taskName: event.target.value } : current))
                }
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                タスク種
                <select
                  value={editForm.taskTypeId}
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, taskTypeId: event.target.value } : current))
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
                  value={editForm.statusId}
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, statusId: event.target.value } : current))
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
                  value={editForm.assigneeId}
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, assigneeId: event.target.value } : current))
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
                  value={editForm.startDate}
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, startDate: event.target.value } : current))
                  }
                />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                終了日
                <input
                  type="date"
                  value={editForm.endDate}
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, endDate: event.target.value } : current))
                  }
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 4 }}>
              備考
              <textarea
                rows={3}
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, notes: event.target.value } : current))
                }
              />
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  if (!editForm) return;
                  const deleted = await handleDeleteTask(editForm.taskId);
                  if (deleted) {
                    closeEditModal();
                  }
                }}
              >
                削除
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={closeEditModal}>
                  キャンセル
                </button>
                <button className="primary" type="submit">
                  保存
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function ReleaseDateTable({
  canEdit,
  channels,
  releaseDates,
  releaseForm,
  onReleaseFormChange,
  onCreate,
  onSave,
  onDelete
}: {
  canEdit: boolean;
  channels: Channel[];
  releaseDates: ReleaseDateRow[];
  releaseForm: ReleaseForm;
  onReleaseFormChange: React.Dispatch<React.SetStateAction<ReleaseForm>>;
  onCreate: () => Promise<void>;
  onSave: (id: string, patch: { releaseDate?: string; label?: string | null }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { releaseDate: string; label: string }>>({});

  const rows = useMemo(
    () =>
      [...releaseDates].sort((left, right) => {
        if (left.release_date !== right.release_date) {
          return left.release_date.localeCompare(right.release_date);
        }
        if (left.channel_name !== right.channel_name) {
          return left.channel_name.localeCompare(right.channel_name);
        }
        return left.script_no.localeCompare(right.script_no);
      }),
    [releaseDates]
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
          <thead>
            <tr style={{ background: "var(--panel-muted)" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>チャンネル</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>脚本番号</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>公開日</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>ラベル</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.id];
              const releaseDate = draft?.releaseDate ?? row.release_date;
              const label = draft?.label ?? row.label ?? "";
              const busy = rowBusyId === row.id;

              return (
                <tr key={row.id}>
                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>{row.channel_name}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>{row.script_no}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                    <input
                      type="date"
                      value={releaseDate}
                      disabled={!canEdit || busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: {
                            releaseDate: value,
                            label
                          }
                        }));
                      }}
                    />
                  </td>
                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                    <input
                      value={label}
                      disabled={!canEdit || busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: {
                            releaseDate,
                            label: value
                          }
                        }));
                      }}
                    />
                  </td>
                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={!canEdit || busy}
                        onClick={async () => {
                          const normalizedLabel = label.trim();
                          const changed =
                            releaseDate !== row.release_date || normalizedLabel !== (row.label ?? "");
                          if (!changed) return;

                          setRowBusyId(row.id);
                          try {
                            const saved = await onSave(row.id, {
                              releaseDate,
                              label: normalizedLabel ? normalizedLabel : null
                            });
                            if (saved) {
                              setDrafts((current) => {
                                const next = { ...current };
                                delete next[row.id];
                                return next;
                              });
                            }
                          } finally {
                            setRowBusyId(null);
                          }
                        }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!canEdit || busy}
                        onClick={async () => {
                          setRowBusyId(row.id);
                          try {
                            await onDelete(row.id);
                          } finally {
                            setRowBusyId(null);
                          }
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            <tr style={{ background: "#fffdf8" }}>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <select
                  value={releaseForm.channelId}
                  disabled={!canEdit || busy}
                  onChange={(event) => onReleaseFormChange((current) => ({ ...current, channelId: event.target.value }))}
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <input
                  value={releaseForm.scriptNo}
                  placeholder="脚本番号"
                  disabled={!canEdit || busy}
                  onChange={(event) => onReleaseFormChange((current) => ({ ...current, scriptNo: event.target.value }))}
                />
              </td>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <input
                  type="date"
                  value={releaseForm.releaseDate}
                  disabled={!canEdit || busy}
                  onChange={(event) => onReleaseFormChange((current) => ({ ...current, releaseDate: event.target.value }))}
                />
              </td>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <input
                  value={releaseForm.label}
                  placeholder="ラベル(任意)"
                  disabled={!canEdit || busy}
                  onChange={(event) => onReleaseFormChange((current) => ({ ...current, label: event.target.value }))}
                />
              </td>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <button
                  type="button"
                  className="primary"
                  disabled={!canEdit || busy || !releaseForm.channelId || !releaseForm.scriptNo.trim() || !releaseForm.releaseDate}
                  onClick={async () => {
                    if (!releaseForm.channelId || !releaseForm.scriptNo.trim() || !releaseForm.releaseDate) return;

                    setBusy(true);
                    try {
                      await onCreate();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  追加
                </button>
              </td>
            </tr>

            {!rows.length ? (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 12, border: "1px solid var(--line)" }}>
                  公開日データがありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!canEdit ? <div className="muted">編集権限ユーザーのみ編集できます。</div> : null}
    </div>
  );
}

type MasterTablePatch = {
  name: string;
  sortOrder?: number;
  toggle: boolean;
};

type MasterTableRow = {
  id: string;
  name: string;
  sortOrder?: number;
  toggle: boolean;
};

type MasterDragState = {
  pointerId: number;
  rowId: string;
  overId: string;
  position: DropPosition;
};

function MasterTableEditor({
  title,
  rows,
  toggleLabel,
  canEdit,
  enableSortOrder = false,
  createToggleDefault = false,
  onCreate,
  onSave,
  onDelete,
  onReorder
}: {
  title: string;
  rows: MasterTableRow[];
  toggleLabel: string;
  canEdit: boolean;
  enableSortOrder?: boolean;
  createToggleDefault?: boolean;
  onCreate: (patch: MasterTablePatch) => Promise<void>;
  onSave: (id: string, patch: MasterTablePatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder?: (orderedIds: string[]) => Promise<void>;
}) {
  const [createName, setCreateName] = useState("");
  const [createToggle, setCreateToggle] = useState(createToggleDefault);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [orderedRows, setOrderedRows] = useState(rows);
  const [dragState, setDragState] = useState<MasterDragState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { name?: string; toggle?: boolean }>>({});

  useEffect(() => {
    if (dragState || reorderBusy) return;
    setOrderedRows(rows);
  }, [dragState, reorderBusy, rows]);

  const reorderEnabled = enableSortOrder && Boolean(onReorder);
  const reorderLocked = busy || rowBusyId !== null || reorderBusy;
  const interactionLocked = busy || rowBusyId !== null || reorderBusy || dragState !== null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr style={{ background: "var(--panel-muted)" }}>
              {reorderEnabled ? (
                <th
                  style={{ textAlign: "center", width: 88, padding: "8px 10px", border: "1px solid var(--line)", whiteSpace: "nowrap" }}
                >
                  並び替え
                </th>
              ) : null}
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>名称</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>{toggleLabel}</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row) => {
              const draft = drafts[row.id];
              const name = draft?.name ?? row.name;
              const toggle = draft?.toggle ?? row.toggle;
              const busyRow = rowBusyId === row.id;
              const isDraggingRow = dragState?.rowId === row.id;
              const showDropBefore =
                dragState && dragState.rowId !== row.id && dragState.overId === row.id && dragState.position === "before";
              const showDropAfter =
                dragState && dragState.rowId !== row.id && dragState.overId === row.id && dragState.position === "after";
              const dropBorderStyle = showDropBefore
                ? { boxShadow: "inset 0 2px 0 #1948b1" }
                : showDropAfter
                  ? { boxShadow: "inset 0 -2px 0 #1948b1" }
                  : undefined;

              return (
                <tr key={row.id} data-row-id={row.id} style={{ opacity: isDraggingRow ? 0.55 : 1 }}>
                  {reorderEnabled ? (
                    <td style={{ padding: "8px 10px", border: "1px solid var(--line)", textAlign: "center", ...dropBorderStyle }}>
                      <button
                        type="button"
                        aria-label="並び替え"
                        disabled={!canEdit || reorderLocked || (dragState !== null && dragState.rowId !== row.id)}
                        onPointerDown={(event) => {
                          if (!canEdit || reorderLocked) return;
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragState({
                            pointerId: event.pointerId,
                            rowId: row.id,
                            overId: row.id,
                            position: "after"
                          });
                        }}
                        onPointerMove={(event) => {
                          if (!dragState || dragState.pointerId !== event.pointerId) return;
                          const element = document.elementFromPoint(event.clientX, event.clientY);
                          if (!(element instanceof HTMLElement)) return;

                          const targetRow = element.closest("tr[data-row-id]");
                          if (!(targetRow instanceof HTMLTableRowElement)) return;
                          if (targetRow.closest("table") !== event.currentTarget.closest("table")) return;

                          const overId = targetRow.dataset.rowId;
                          if (!overId) return;

                          const rect = targetRow.getBoundingClientRect();
                          const position: DropPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";

                          setDragState((current) => {
                            if (!current || current.pointerId !== event.pointerId) return current;
                            if (current.overId === overId && current.position === position) return current;
                            return { ...current, overId, position };
                          });
                        }}
                        onPointerUp={(event) => {
                          if (!dragState || dragState.pointerId !== event.pointerId) return;
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }

                          const currentDrag = dragState;
                          setDragState(null);

                          if (!onReorder) return;
                          const nextRows = moveItemByDrop(orderedRows, currentDrag.rowId, currentDrag.overId, currentDrag.position);
                          const changed = nextRows.some((nextRow, index) => nextRow.id !== orderedRows[index]?.id);
                          if (!changed) return;

                          const previousRows = orderedRows;
                          setOrderedRows(nextRows);
                          setReorderBusy(true);
                          void (async () => {
                            try {
                              await onReorder(nextRows.map((nextRow) => nextRow.id));
                            } catch {
                              setOrderedRows(previousRows);
                            } finally {
                              setReorderBusy(false);
                            }
                          })();
                        }}
                        onPointerCancel={(event) => {
                          if (!dragState || dragState.pointerId !== event.pointerId) return;
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }
                          setDragState(null);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          cursor: !canEdit || reorderLocked ? "default" : "grab",
                          touchAction: "none",
                          userSelect: "none",
                          lineHeight: "26px",
                          fontSize: 15
                        }}
                      >
                        ≡
                      </button>
                    </td>
                  ) : null}

                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)", ...dropBorderStyle }}>
                    <input
                      value={name}
                      disabled={!canEdit || busyRow || interactionLocked}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: {
                            ...current[row.id],
                            name: event.target.value
                          }
                        }))
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)", ...dropBorderStyle }}>
                    <input
                      type="checkbox"
                      checked={toggle}
                      disabled={!canEdit || busyRow || interactionLocked}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.id]: {
                            ...current[row.id],
                            toggle: event.target.checked
                          }
                        }))
                      }
                    />
                  </td>

                  <td style={{ padding: "8px 10px", border: "1px solid var(--line)", ...dropBorderStyle }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={!canEdit || busyRow || interactionLocked}
                        onClick={async () => {
                          const normalizedName = name.trim();
                          if (!normalizedName) return;

                          setRowBusyId(row.id);
                          try {
                            await onSave(row.id, {
                              name: normalizedName,
                              toggle
                            });
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[row.id];
                              return next;
                            });
                          } finally {
                            setRowBusyId(null);
                          }
                        }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!canEdit || busyRow || interactionLocked}
                        onClick={async () => {
                          if (!window.confirm(`${row.name} を削除しますか？`)) return;

                          setRowBusyId(row.id);
                          try {
                            await onDelete(row.id);
                          } finally {
                            setRowBusyId(null);
                          }
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            <tr style={{ background: "#fffdf8" }}>
              {reorderEnabled ? <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }} /> : null}
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <input
                  value={createName}
                  placeholder={`${title}を追加`}
                  disabled={!canEdit || interactionLocked}
                  onChange={(event) => setCreateName(event.target.value)}
                />
              </td>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <input
                  type="checkbox"
                  checked={createToggle}
                  disabled={!canEdit || interactionLocked}
                  onChange={(event) => setCreateToggle(event.target.checked)}
                />
              </td>
              <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                <button
                  type="button"
                  className="primary"
                  disabled={!canEdit || interactionLocked || !createName.trim()}
                  onClick={async () => {
                    const normalizedName = createName.trim();
                    if (!normalizedName) return;

                    setBusy(true);
                    try {
                      await onCreate({
                        name: normalizedName,
                        toggle: createToggle
                      });
                      setCreateName("");
                      setCreateToggle(createToggleDefault);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  追加
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {!canEdit ? <div className="muted">管理者のみ編集できます。</div> : null}
    </div>
  );
}

function MemberRoleTable({
  canEdit,
  members,
  onUpdateRole
}: {
  canEdit: boolean;
  members: WorkspaceMember[];
  onUpdateRole: (userId: string, nextRole: WorkspaceRole) => Promise<void>;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        管理者のみ変更可能です。ユーザー招待自体はSupabase Auth側で行ってください。
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
          <thead>
            <tr style={{ background: "var(--panel-muted)" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>ユーザーID</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>加入日</th>
              <th style={{ textAlign: "left", padding: "8px 10px", border: "1px solid var(--line)" }}>ロール</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.user_id}>
                <td style={{ padding: "8px 10px", border: "1px solid var(--line)", wordBreak: "break-all" }}>{member.user_id}</td>
                <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>{member.created_at.slice(0, 10)}</td>
                <td style={{ padding: "8px 10px", border: "1px solid var(--line)" }}>
                  <select
                    value={member.role}
                    disabled={!canEdit}
                    onChange={(event) => {
                      void onUpdateRole(member.user_id, event.target.value as WorkspaceRole);
                    }}
                  >
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                </td>
              </tr>
            ))}

            {!members.length ? (
              <tr>
                <td colSpan={3} className="muted" style={{ padding: 12, border: "1px solid var(--line)" }}>
                  メンバーがまだいません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
