create index if not exists tasks_workspace_status_idx on public.tasks (workspace_id, status_id);
create index if not exists tasks_workspace_task_type_idx on public.tasks (workspace_id, task_type_id);
create index if not exists tasks_workspace_assignee_idx on public.tasks (workspace_id, assignee_id);
create index if not exists release_dates_workspace_release_date_idx on public.release_dates (workspace_id, release_date);
