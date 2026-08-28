-- Claude Wallet Telegram bridge
-- Edge Function is the only writer; nothing exposed to anon/authenticated

create extension if not exists "pgcrypto";

create table if not exists wallet_feedback (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  telegram_user_id bigint,
  telegram_message_id bigint not null,
  message text not null check (char_length(message) between 1 and 4000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'accepted', 'done', 'dismissed')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (telegram_chat_id, telegram_message_id)
);

create table if not exists wallet_progress (
  id uuid primary key default gen_random_uuid(),
  phase text not null default 'wallet transaction',
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'cancelled', 'failure')),
  balance numeric(15, 2),
  transaction_id integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_feedback_status_created_at_idx
  on wallet_feedback(status, created_at desc);
create index if not exists wallet_progress_created_at_idx
  on wallet_progress(created_at desc);

alter table wallet_feedback enable row level security;
alter table wallet_progress enable row level security;
revoke all on table wallet_feedback, wallet_progress from anon, authenticated;
grant select, insert, update, delete on table wallet_feedback, wallet_progress to service_role;

comment on table wallet_feedback is
  'Feedback received from user through Claude Wallet Telegram bot.';
comment on table wallet_progress is
  'Wallet transaction milestones used by Telegram notifications.';
