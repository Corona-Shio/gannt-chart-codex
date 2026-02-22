create extension if not exists pgcrypto;

create type public.workspace_role as enum ('admin', 'editor', 'viewer');

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  script_no text not null,
  title text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, script_no)
);

create table if not exists public.task_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.task_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.assignees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, display_name)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_id uuid not null references public.channels (id),
  script_id uuid not null references public.scripts (id),
  task_type_id uuid not null references public.task_types (id),
  status_id uuid not null references public.task_statuses (id),
  assignee_id uuid references public.assignees (id),
  task_name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_date_check check (start_date <= end_date)
);

create index if not exists tasks_workspace_channel_idx on public.tasks (workspace_id, channel_id);
create index if not exists tasks_workspace_script_idx on public.tasks (workspace_id, script_id);
create index if not exists tasks_workspace_range_idx on public.tasks (workspace_id, start_date, end_date);

create table if not exists public.release_dates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_id uuid not null references public.channels (id),
  script_id uuid not null references public.scripts (id),
  release_date date not null,
  label text,
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, channel_id, script_id)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.vendor_rates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  task_type_id uuid references public.task_types (id),
  unit_price numeric(12, 2) not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create table if not exists public.task_cost_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id),
  amount numeric(12, 2) not null,
  cost_month date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_payment_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null,
  total_amount numeric(12, 2) not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, month)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_scripts_updated_at
before update on public.scripts
for each row execute function public.touch_updated_at();

create trigger touch_tasks_updated_at
before update on public.tasks
for each row execute function public.touch_updated_at();

create trigger touch_release_dates_updated_at
before update on public.release_dates
for each row execute function public.touch_updated_at();

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text = any(allowed_roles)
  );
$$;

grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

create or replace function public.bootstrap_workspace(workspace_name text default 'Anime Team')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_workspace_id uuid;
  new_workspace_id uuid;
begin
  select wm.workspace_id
  into existing_workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  insert into public.workspaces (name)
  values (workspace_name)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, auth.uid(), 'admin');

  insert into public.channels (workspace_id, name, sort_order)
  values
    (new_workspace_id, 'メインチャンネル', 10),
    (new_workspace_id, 'ショート', 20),
    (new_workspace_id, '切り抜き', 30);

  insert into public.task_types (workspace_id, name, sort_order)
  values
    (new_workspace_id, '企画', 10),
    (new_workspace_id, '脚本', 20),
    (new_workspace_id, 'イラスト案', 30),
    (new_workspace_id, 'サムネ監', 40),
    (new_workspace_id, 'イラスト', 50),
    (new_workspace_id, '編集', 60),
    (new_workspace_id, 'サムネ', 70),
    (new_workspace_id, 'イラスト監', 80),
    (new_workspace_id, 'その他', 90),
    (new_workspace_id, '休暇', 100);

  insert into public.task_statuses (workspace_id, name, sort_order, is_done)
  values
    (new_workspace_id, '未着手', 10, false),
    (new_workspace_id, '進行中', 20, false),
    (new_workspace_id, 'レビュー中', 30, false),
    (new_workspace_id, '修正中', 40, false),
    (new_workspace_id, '完了', 50, true),
    (new_workspace_id, '納品済', 60, true),
    (new_workspace_id, '保留', 70, false);

  return new_workspace_id;
end;
$$;

grant execute on function public.bootstrap_workspace(text) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.channels enable row level security;
alter table public.scripts enable row level security;
alter table public.task_types enable row level security;
alter table public.task_statuses enable row level security;
alter table public.assignees enable row level security;
alter table public.tasks enable row level security;
alter table public.release_dates enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_rates enable row level security;
alter table public.task_cost_entries enable row level security;
alter table public.monthly_payment_snapshots enable row level security;

create policy "members can read workspaces" on public.workspaces
for select
using (public.has_workspace_role(id, array['admin', 'editor', 'viewer']));

create policy "admins can update workspaces" on public.workspaces
for update
using (public.has_workspace_role(id, array['admin']))
with check (public.has_workspace_role(id, array['admin']));

create policy "members can read members" on public.workspace_members
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage members" on public.workspace_members
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read channels" on public.channels
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage channels" on public.channels
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read scripts" on public.scripts
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "editors can manage scripts" on public.scripts
for all
using (public.has_workspace_role(workspace_id, array['admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['admin', 'editor']));

create policy "members can read task_types" on public.task_types
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage task_types" on public.task_types
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read task_statuses" on public.task_statuses
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage task_statuses" on public.task_statuses
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read assignees" on public.assignees
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage assignees" on public.assignees
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read tasks" on public.tasks
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "editors can manage tasks" on public.tasks
for all
using (public.has_workspace_role(workspace_id, array['admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['admin', 'editor']));

create policy "members can read release_dates" on public.release_dates
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "editors can manage release_dates" on public.release_dates
for all
using (public.has_workspace_role(workspace_id, array['admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['admin', 'editor']));

create policy "members can read vendors" on public.vendors
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage vendors" on public.vendors
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read vendor_rates" on public.vendor_rates
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage vendor_rates" on public.vendor_rates
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read task_cost_entries" on public.task_cost_entries
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage task_cost_entries" on public.task_cost_entries
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

create policy "members can read monthly_payment_snapshots" on public.monthly_payment_snapshots
for select
using (public.has_workspace_role(workspace_id, array['admin', 'editor', 'viewer']));

create policy "admins can manage monthly_payment_snapshots" on public.monthly_payment_snapshots
for all
using (public.has_workspace_role(workspace_id, array['admin']))
with check (public.has_workspace_role(workspace_id, array['admin']));

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.release_dates;
