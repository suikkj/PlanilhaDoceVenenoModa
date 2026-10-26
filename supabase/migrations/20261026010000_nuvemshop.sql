-- Nuvemshop integration. Only adds columns and tables; existing data is untouched.
-- Repeats the 2026-10-25 columns in case that migration was not run yet.
alter table public.pecas add column if not exists forma_pagamento text;
alter table public.pecas add column if not exists cliente_nome text;
alter table public.pecas add column if not exists cliente_telefone text;
alter table public.pecas add column if not exists fornecedor text;
alter table public.pecas add column if not exists pedido_nuvemshop text;

create table if not exists public.nuvemshop_pedidos (
  pedido_id text primary key,
  numero text,
  status text not null default 'processando',
  cliente text,
  data_venda date,
  itens_pendentes jsonb not null default '[]'::jsonb,
  erro text,
  created_at timestamptz not null default now()
);

create table if not exists public.nuvemshop_config (
  id int primary key default 1 check (id = 1),
  store_id text not null,
  access_token text not null,
  updated_at timestamptz not null default now()
);

-- No policies: only the server (service role key) can read these. The access token never reaches the browser.
alter table public.nuvemshop_pedidos enable row level security;
alter table public.nuvemshop_config enable row level security;
