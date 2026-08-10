-- ========================================================================
-- YouTube AI Summary - Supabase schema
-- 适用 Supabase Postgres
-- 在 Supabase SQL Editor 里直接运行
-- ========================================================================

-- 1. profiles（扩展 auth.users）
-- ========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  plan text not null default 'free' check (plan in ('free', 'pro', 'grace')),
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profile self read" on public.profiles
  for select using (auth.uid() = id);

create policy "profile self update" on public.profiles
  for update using (auth.uid() = id);

-- 自动在用户注册时创建 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan)
  values (new.id, new.email, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. subscriptions（订阅状态，Lemon Squeezy webhook 写入）
-- ========================================================================
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Paddle (主要，2026-08 起使用)
  paddle_customer_id text,         -- ctm_xxx
  paddle_subscription_id text,     -- sub_xxx

  -- Lemon Squeezy (遗留字段，已废弃但保留兼容；2026-08 之后不再写入)
  lemon_customer_id bigint,
  lemon_subscription_id bigint,
  ls_status text,

  status text not null check (status in ('active', 'on_trial', 'past_due', 'paused', 'unpaid', 'cancelled', 'expired', 'grace')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Paddle 相关索引（webhook 频繁按 customer_id 查）
create index if not exists idx_subscriptions_paddle_customer on public.subscriptions (paddle_customer_id);
create index if not exists idx_subscriptions_paddle_sub on public.subscriptions (paddle_subscription_id);

alter table public.subscriptions enable row level security;

create policy "sub self read" on public.subscriptions
  for select using (auth.uid() = user_id);


-- 3. videos（去重的 video summary 缓存）
-- ========================================================================
create table if not exists public.videos (
  id bigserial primary key,
  youtube_video_id text not null,
  title text,
  channel text,
  summary text,
  bullets jsonb,
  timeline jsonb,
  insight text,
  language text default 'auto',
  model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (youtube_video_id, language)
);

create index if not exists idx_videos_yt_id on public.videos (youtube_video_id);

alter table public.videos enable row level security;

create policy "videos public read" on public.videos
  for select using (true);


-- 4. usage_logs（用量日志，风控/账单）
-- ========================================================================
create table if not exists public.usage_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text,
  tokens int default 0,
  source text check (source in ('ai', 'cache')),
  created_at timestamptz default now()
);

create index if not exists idx_usage_user_date on public.usage_logs (user_id, created_at);

alter table public.usage_logs enable row level security;

create policy "usage self read" on public.usage_logs
  for select using (auth.uid() = user_id);


-- 5. helper views
-- ========================================================================

-- 今天的用量（db 角度；线上以 Redis incr 为主）
create or replace view public.v_daily_usage as
select
  user_id,
  date_trunc('day', created_at)::date as day,
  count(*) as n,
  sum(tokens) as tokens
from public.usage_logs
group by 1, 2;

-- 给后端 service_role 写入用的安全视图（不需要 rls，影响 row count）
comment on table public.videos is 'cache of summary results; service_role inserts only';
comment on table public.usage_logs is 'audited logs; service_role inserts only';


-- 6. updated_at 触发器
-- ========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_profiles_updated_at on public.profiles;
create trigger tr_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists tr_subscriptions_updated_at on public.subscriptions;
create trigger tr_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists tr_videos_updated_at on public.videos;
create trigger tr_videos_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();
