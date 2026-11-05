-- Store promotion per piece: percent off shown on Nuvemshop as the variant's promotional price. Null = no promotion. Only adds a column.
alter table public.pecas add column if not exists promo_pct numeric(5,2)
  check (promo_pct is null or (promo_pct > 0 and promo_pct < 100));
