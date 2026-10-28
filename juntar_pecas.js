// One-off: merges in-stock rows with the exact same name, sale price and cost into one row
// (quantities summed, colors/sizes kept per unit, photos combined). Sold rows are untouched.
// Usage: node juntar_pecas.js            -> only shows what would change
//        node juntar_pecas.js --aplicar  -> writes to the database
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { stockUnits, joinList } = require('./public/js/variants.js');

// Returns the merged fields, or a reason string when the group can't be merged safely.
function merge(rows) {
    const units = [];
    for (const p of rows) {
        const s = stockUnits(p);
        if (!s.paired) return `cores/tamanhos de "${p.nome}" (id ${p.id}) não batem com a quantidade`;
        units.push(...s.units);
    }
    const col = k => {
        const l = units.map(u => u[k]);
        if (l.some(Boolean) && !l.every(Boolean)) return undefined; // some units without color/size: list would misalign
        return l.some(Boolean) ? joinList(l) : null;
    };
    const cor = col('cor'), tamanho = col('tam');
    if (cor === undefined || tamanho === undefined) return 'algumas linhas têm cor/tamanho e outras não';
    const fotos = [...new Map(rows.flatMap(p => p.fotos || []).map(f => [f.path, f])).values()];
    return { quantidade: units.length, cor, tamanho, fotos };
}

// Self-check with the case from the screenshot.
{
    const r = merge([
        { id: 1, nome: 'Blusa', quantidade: 1, cor: 'Azul BB', tamanho: 'U', fotos: [{ path: 'a' }] },
        { id: 2, nome: 'Blusa', quantidade: 2, cor: 'preta, Verde', tamanho: 'U', fotos: [{ path: 'b' }, { path: 'a' }] },
    ]);
    console.assert(r.quantidade === 3 && r.cor === 'Azul BB, preta, Verde' && r.tamanho === 'U' && r.fotos.length === 2, 'merge falhou', r);
    const s = stockUnits({ ...r }); console.assert(s.paired && s.units.length === 3, 'resultado não fecha com a quantidade');
}

async function main() {
    const aplicar = process.argv.includes('--aplicar');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.from('pecas').select('*').neq('status', 'vendida').order('id');
    if (error) throw error;

    const groups = new Map();
    for (const p of data) {
        const key = JSON.stringify([p.nome, Number(p.preco_venda), Number(p.preco_comprado_unitario)]);
        groups.set(key, [...(groups.get(key) || []), p]);
    }

    let feitos = 0;
    for (const rows of groups.values()) {
        if (rows.length < 2) continue;
        const [keep, ...rest] = rows; // oldest row stays
        const m = merge(rows);
        if (typeof m === 'string') { console.log(`PULADO: ${m}`); continue; }
        console.log(`${keep.nome} (R$ ${keep.preco_venda}): ${rows.length} linhas -> 1 | qtd ${m.quantidade} | cor ${m.cor ?? '-'} | tam ${m.tamanho ?? '-'} | ${m.fotos.length} fotos`);
        if (!aplicar) continue;
        // Update first, delete after: a failure in between leaves extra stock, never lost stock.
        const up = await supabase.from('pecas').update(m).eq('id', keep.id);
        if (up.error) throw up.error;
        // Direct delete (not the API) so the photo files, now on the kept row, are not removed.
        const del = await supabase.from('pecas').delete().in('id', rest.map(p => p.id));
        if (del.error) throw del.error;
        feitos++;
    }
    console.log(aplicar ? `\n${feitos} grupos juntados.` : '\nNada foi gravado. Rode com --aplicar para juntar.');
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
