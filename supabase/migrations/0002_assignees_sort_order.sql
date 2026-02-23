alter table public.assignees
  add column if not exists sort_order int;

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id
      order by created_at asc, id asc
    ) as order_no
  from public.assignees
)
update public.assignees as a
set sort_order = ranked.order_no * 10
from ranked
where a.id = ranked.id
  and a.sort_order is null;

update public.assignees
set sort_order = 0
where sort_order is null;

alter table public.assignees
  alter column sort_order set default 0;

alter table public.assignees
  alter column sort_order set not null;

create index if not exists assignees_workspace_sort_idx
  on public.assignees (workspace_id, sort_order);
