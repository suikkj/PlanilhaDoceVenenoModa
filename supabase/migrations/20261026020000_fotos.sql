-- Photos of each piece: list of { path, url } in the public bucket fotos_estoque_doce_veneno.
alter table public.pecas add column if not exists fotos jsonb not null default '[]'::jsonb;
-- Which photos the site already sent to each Nuvemshop product: list of { path, id }.
alter table public.nuvemshop_produtos add column if not exists fotos_enviadas jsonb not null default '[]'::jsonb;
