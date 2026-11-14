-- A change to a piece already in the queue refreshes its timestamp, so a sync that started before the
-- change can tell it is stale and leaves the entry for the next run.
create or replace function public.fila_nuvemshop() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.nome is not null then insert into nuvemshop_fila(nome) values (old.nome) on conflict (nome) do update set created_at = now(); end if;
  if tg_op <> 'DELETE' and new.nome is not null then insert into nuvemshop_fila(nome) values (new.nome) on conflict (nome) do update set created_at = now(); end if;
  return null;
end $$;
