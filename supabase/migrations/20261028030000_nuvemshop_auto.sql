-- Automatic Nuvemshop sync. Only adds tables, a trigger and a scheduled job; existing data is untouched.
-- Any change to a piece (from the site or straight in the database) queues its name; the scheduled run syncs it.
create table if not exists public.nuvemshop_fila (
  nome text primary key,
  created_at timestamptz not null default now()
);
alter table public.nuvemshop_fila enable row level security;

create or replace function public.fila_nuvemshop() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.nome is not null then insert into nuvemshop_fila(nome) values (old.nome) on conflict do nothing; end if;
  if tg_op <> 'DELETE' and new.nome is not null then insert into nuvemshop_fila(nome) values (new.nome) on conflict do nothing; end if;
  return null;
end $$;
drop trigger if exists pecas_fila_nuvemshop on public.pecas;
create trigger pecas_fila_nuvemshop after insert or update or delete on public.pecas
  for each row execute function public.fila_nuvemshop();

-- Secret the scheduled call sends; the server compares it. Never leaves the database and the server.
create table if not exists public.cron_config (id int primary key default 1 check (id = 1), secret text not null);
alter table public.cron_config enable row level security;
create extension if not exists pgcrypto;
insert into public.cron_config (id, secret) values (1, encode(extensions.gen_random_bytes(24), 'hex')) on conflict (id) do nothing;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('nuvemshop-sync', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://planilhadocevenenomoda.vercel.app/api/cron/nuvemshop',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select secret from public.cron_config where id = 1), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$$);
