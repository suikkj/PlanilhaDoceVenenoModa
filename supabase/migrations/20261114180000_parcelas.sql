-- Parcelas de uma venda no cartão de crédito.
alter table public.pecas add column if not exists parcelas smallint;
