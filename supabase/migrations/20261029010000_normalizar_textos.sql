-- Normaliza nomes, cores e tamanhos das peças, inclusive o que for digitado depois (trigger).
-- Cor: uma forma só por cor ("Preta" e "Preto" viram "Preto"), "BB" vira "Bebê", cada palavra com inicial maiúscula.
-- A sincronização com a Nuvemshop cria a variação com o nome novo e zera a antiga ("Preta").

create or replace function dv_palavra_cor(w text) returns text language sql immutable as $$
  select case translate(lower(w), 'áàâãéêíóôõúç', 'aaaaeeiooouc')
    when 'preta' then 'Preto' when 'branca' then 'Branco' when 'vermelha' then 'Vermelho'
    when 'amarela' then 'Amarelo' when 'estampada' then 'Estampado' when 'listrada' then 'Listrado' when 'estampa' then 'Estampado'
    when 'bb' then 'Bebê' when 'bebe' then 'Bebê' when 'off' then 'Off-White' when 'lilas' then 'Lilás'
    when 'fucsia' then 'Fúcsia' when 'petroleo' then 'Petróleo' when 'degrade' then 'Degradê'
    when 'salmao' then 'Salmão' when 'cafe' then 'Café' when 'vesrde' then 'Verde' when 'miusgo' then 'Musgo'
    when 'multicores' then 'Multicor' when 'colorido' then 'Multicor' when 'variada' then 'Multicor'
    else initcap(lower(w)) end
$$;

create or replace function dv_cor(t text) returns text language sql immutable as $$
  select nullif(string_agg(item, ', ' order by i), '') from (
    select i, (select string_agg(
             (select string_agg(dv_palavra_cor(w), ' ' order by j)
                from unnest(regexp_split_to_array(trim(parte), '\s+')) with ordinality as x(w, j) where w <> ''),
             '/' order by k)
           from unnest(string_to_array(
             regexp_replace(regexp_replace(lower(trim(bruto)), 'terra\s+cota', 'terracota', 'g'), 'listra\s+branca', 'listrado branco', 'g'),
             '/')) with ordinality as y(parte, k) where trim(parte) <> '') as item
    from unnest(string_to_array(t, ',')) with ordinality as z(bruto, i)
    where trim(bruto) <> ''
  ) s
$$;

create or replace function dv_titulo(t text) returns text language sql immutable as $$
  select nullif(initcap(regexp_replace(trim(t), '\s+', ' ', 'g')), '')
$$;

create or replace function normalizar_peca() returns trigger language plpgsql as $$
begin
  new.nome := dv_titulo(new.nome);
  new.cor := dv_cor(new.cor);
  new.tamanho := nullif(upper(regexp_replace(trim(new.tamanho), '\s*,\s*', ', ', 'g')), '');
  new.cliente_nome := dv_titulo(new.cliente_nome);
  new.fornecedor := dv_titulo(new.fornecedor);
  return new;
end $$;

drop trigger if exists pecas_normalizar on pecas;
create trigger pecas_normalizar before insert or update on pecas for each row execute function normalizar_peca();

-- Aplica ao que já existe (o trigger faz o trabalho); só nas linhas que mudam, para não resincronizar o resto.
update pecas set nome = nome
where nome is distinct from dv_titulo(nome) or cor is distinct from dv_cor(cor)
   or tamanho is distinct from nullif(upper(regexp_replace(trim(tamanho), '\s*,\s*', ', ', 'g')), '')
   or cliente_nome is distinct from dv_titulo(cliente_nome) or fornecedor is distinct from dv_titulo(fornecedor);
