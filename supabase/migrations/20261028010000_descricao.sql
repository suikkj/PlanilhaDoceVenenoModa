-- Optional description of each piece; also sent to the Nuvemshop product. Only adds a column.
alter table public.pecas add column if not exists descricao text;
