-- Store promotion per piece: percent off shown on Nuvemshop as the variant's promotional price, optionally limited to a
-- date range (Sao Paulo dates, both ends inclusive). Null percent = no promotion. Only adds columns and a daily job.
alter table public.pecas add column if not exists promo_pct numeric(5,2)
  check (promo_pct is null or (promo_pct > 0 and promo_pct < 100));
alter table public.pecas add column if not exists promo_inicio date;
alter table public.pecas add column if not exists promo_fim date;

-- Just after midnight in Sao Paulo, queue the pieces whose promotion starts today or ended yesterday,
-- so the scheduled sync turns the promotional price on or off on Nuvemshop.
select cron.schedule('promocao-datas', '1 3 * * *', $$
  insert into public.nuvemshop_fila(nome)
  select distinct nome from public.pecas
  where promo_pct is not null and nome is not null
    and (promo_inicio = (now() at time zone 'America/Sao_Paulo')::date
      or promo_fim = (now() at time zone 'America/Sao_Paulo')::date - 1)
  on conflict do nothing
$$);
