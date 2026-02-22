export type WorkspaceRole = "admin" | "editor" | "viewer";

export type GroupBy = "channel" | "none";
export type SortBy = "script_no_asc" | "script_no_desc" | "start_date_asc" | "start_date_desc";

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Script {
  id: string;
  workspace_id: string;
  script_no: string;
  title: string | null;
  status: string | null;
  notes: string | null;
}

export interface TaskType {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface TaskStatus {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_done: boolean;
}

export interface Assignee {
  id: string;
  workspace_id: string;
  display_name: string;
  is_active: boolean;
}

export interface Task {
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
}

export interface TaskRow extends Task {
  channel_name: string;
  script_no: string;
  script_title: string | null;
  task_type_name: string;
  status_name: string;
  assignee_name: string | null;
}

export interface ReleaseDate {
  id: string;
  workspace_id: string;
  channel_id: string;
  script_id: string;
  release_date: string;
  label: string | null;
}

export interface ReleaseDateRow extends ReleaseDate {
  channel_name: string;
  script_no: string;
}

export interface TaskFilters {
  channelIds?: string[];
  assigneeIds?: string[];
  statusIds?: string[];
  taskTypeIds?: string[];
  rangeStart?: string;
  rangeEnd?: string;
}
