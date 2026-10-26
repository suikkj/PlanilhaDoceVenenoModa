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

if (typeof module !== 'undefined') module.exports = { splitList, stockUnits, available, afterSale, joinList };
