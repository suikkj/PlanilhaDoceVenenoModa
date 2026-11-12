-- Reserva: unidades separadas para uma cliente. Ficam fora do estoque (e da Nuvemshop), sem contar como venda.
-- status = 'reservada'; reserva_origem = linha de estoque de onde saíram (para "Retornar" devolver a ela).
alter table public.pecas add column if not exists reserva_origem bigint;
alter table public.pecas add column if not exists reservada_em date;
