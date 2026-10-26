-- App instalável: notification keys and the devices that receive them. Only adds tables.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.push_inscricoes (
  endpoint text primary key,
  usuario_id uuid not null,
  chaves jsonb not null,
  created_at timestamptz not null default now()
);
-- No policies: only the server (service role key) can read them; the private key never reaches a browser.
alter table public.push_config enable row level security;
alter table public.push_inscricoes enable row level security;
