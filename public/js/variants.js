// Shared by the browser (loaded before app.js) and the server (require).
// Colors and sizes are stored as comma lists, one entry per unit ("Preta, Branca, Branca" + "U, U, U").
const splitList = s => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean);
function stockUnits(p) {
    const n = p.quantidade;
    const fit = l => l.length === n ? l : l.length === 1 ? Array(n).fill(l[0]) : l.length === 0 ? Array(n).fill('') : null;
    const c = fit(splitList(p.cor)), t = fit(splitList(p.tamanho));
    if (c && t) return { paired: true, units: c.map((cor, i) => ({ cor, tam: t[i] })) };
    // Lists don't line up with the quantity: treat colors and sizes independently.
    return { paired: false, c: splitList(p.cor), t: splitList(p.tamanho) };
}
const countOf = (l, v) => l.filter(x => x === v).length;
function available(s, cor, tam, n) {
    if (s.paired) return s.units.filter(u => u.cor === cor && u.tam === tam).length;
    return Math.min(n, s.c.length ? countOf(s.c, cor) : n, s.t.length ? countOf(s.t, tam) : n);
}
const joinList = l => new Set(l).size <= 1 ? (l[0] || null) : l.join(', ');
// What stays in stock after selling q units of cor/tam.
function afterSale(s, cor, tam, q) {
    if (s.paired) {
        let left = q;
        const rest = s.units.filter(u => !(left > 0 && u.cor === cor && u.tam === tam && left--));
        return { cor: joinList(rest.map(u => u.cor).filter(Boolean)), tamanho: joinList(rest.map(u => u.tam).filter(Boolean)) };
    }
    const drop = (l, v) => { let k = q; return l.filter(x => !(k > 0 && x === v && k--)); };
    return { cor: joinList(drop(s.c, cor)), tamanho: joinList(drop(s.t, tam)) };
}

// One spelling per color ("Preta" -> "Preto", "Azul BB" -> "Azul Bebê"). Same rules as dv_cor in the database
// (supabase/migrations/20261029010000_normalizar_textos.sql); keep both in sync.
const COR_PALAVRA = { preta: 'Preto', branca: 'Branco', vermelha: 'Vermelho', amarela: 'Amarelo', estampada: 'Estampado',
    estampa: 'Estampado', listrada: 'Listrado', bb: 'Bebê', bebe: 'Bebê', off: 'Off-White', lilas: 'Lilás', fucsia: 'Fúcsia',
    petroleo: 'Petróleo', degrade: 'Degradê', salmao: 'Salmão', cafe: 'Café', vesrde: 'Verde', miusgo: 'Musgo',
    multicores: 'Multicor', colorido: 'Multicor', variada: 'Multicor' };
const cap = w => w.replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
const canonCor = s => String(s ?? '').trim().toLowerCase().replace(/terra\s+cota/g, 'terracota').replace(/listra\s+branca/g, 'listrado branco')
    .split('/').map(p => p.trim()).filter(Boolean)
    .map(p => p.split(/\s+/).map(w => COR_PALAVRA[w.normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || cap(w)).join(' ')).join('/');

if (typeof module !== 'undefined') module.exports = { splitList, stockUnits, available, afterSale, joinList, canonCor };
