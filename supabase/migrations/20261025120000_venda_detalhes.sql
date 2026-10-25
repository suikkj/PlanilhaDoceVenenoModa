-- Adds optional sale and supplier details. Only adds nullable columns; existing data is untouched.
alter table public.pecas add column if not exists forma_pagamento text;
alter table public.pecas add column if not exists cliente_nome text;
alter table public.pecas add column if not exists cliente_telefone text;
alter table public.pecas add column if not exists fornecedor text;
