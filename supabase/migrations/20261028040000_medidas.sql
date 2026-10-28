-- Measurements of each piece (free text, e.g. 'Busto 88 cm · Cintura 70 cm'); sent with the description. Only adds a column.
alter table public.pecas add column if not exists medidas text;
