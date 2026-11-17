-- A promotion past its end date is removed from the piece (it leaves the Promoções tab).
-- The pecas trigger queues the name, so the Nuvemshop price goes back to normal.
select cron.schedule('promocao-datas', '1 3 * * *', $$
  insert into public.nuvemshop_fila(nome)
  select distinct nome from public.pecas
  where promo_pct is not null and nome is not null
    and promo_inicio = (now() at time zone 'America/Sao_Paulo')::date
  on conflict do nothing;
  update public.pecas set promo_pct = null, promo_inicio = null, promo_fim = null
  where promo_fim < (now() at time zone 'America/Sao_Paulo')::date;
$$);
update public.pecas set promo_pct = null, promo_inicio = null, promo_fim = null
where promo_fim < (now() at time zone 'America/Sao_Paulo')::date;
