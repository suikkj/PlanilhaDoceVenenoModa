-- Cartão-presente vendido na Nuvemshop: cada unidade paga vira um cupom de uso único no mesmo valor.
create table if not exists public.cartoes_presente (
    codigo text primary key,
    valor numeric(10,2) not null,
    pedido_id text not null,
    pedido_numero text,
    cliente text,
    cupom_id text,
    validade date,
    status text not null default 'ativo', -- ativo | cancelado
    created_at timestamptz not null default now()
);
create index if not exists cartoes_presente_pedido on public.cartoes_presente (pedido_id);
alter table public.cartoes_presente enable row level security;
