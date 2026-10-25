// Doce Veneno: estoque e vendas. One file, no framework.
const $ = s => document.querySelector(s);
const LOW_STOCK = 1; // quantity at or below this is flagged as "estoque baixo"
const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
const fmtDate = d => d ? d.slice(0, 10).split('-').reverse().join('/') : '–';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = ym => { const [y, m] = ym.split('-'); return `${MONTHS[m - 1]} ${y}`; };

let pecas = [];
let isAdmin = false;
const filters = { text: '', size: '', color: '', low: false };
const selected = new Set();

// ---------- API ----------
async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(API_BASE_URL + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: body && JSON.stringify(body),
    });
    if (res.status === 401) { logout(); throw new Error('Sua sessão expirou. Entre de novo.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Erro ${res.status}`);
    return data;
}

function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.className = 'toast', 3500);
}
// Runs an action, shows its error as a toast, reloads data on success.
async function run(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); await load(); }
    catch (e) { toast(e.message, true); }
}

function confirmAction(title, text, okLabel) {
    $('#cTitle').textContent = title;
    $('#cText').textContent = text;
    $('#cOk').textContent = okLabel;
    const d = $('#confirmDialog');
    d.returnValue = '';
    d.showModal();
    return new Promise(r => d.addEventListener('close', () => r(d.returnValue === 'ok'), { once: true }));
}

// ---------- Auth ----------
let registering = false;
function showAuth() {
    $('#appView').hidden = true;
    $('#authView').hidden = false;
    $('#authEmail').focus();
}
function logout() {
    localStorage.removeItem('accessToken');
    showAuth();
}
$('#authToggle').onclick = () => {
    registering = !registering;
    $('#authTitle').textContent = registering ? 'Criar conta' : 'Entrar';
    $('#authSubmit').textContent = registering ? 'Criar conta' : 'Entrar';
    $('#authToggle').textContent = registering ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta';
    $('#authPassword').autocomplete = registering ? 'new-password' : 'current-password';
    $('#authMsg').textContent = '';
};
$('#authForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#authMsg');
    const email = $('#authEmail').value.trim(), password = $('#authPassword').value;
    if (!email || password.length < 6) { msg.textContent = 'Informe o email e uma senha com pelo menos 6 caracteres.'; return; }
    $('#authSubmit').disabled = true;
    try {
        if (registering) {
            const r = await api('/auth/register', { method: 'POST', body: { email, password } });
            msg.textContent = r.message;
            $('#authToggle').click();
            msg.textContent = r.message;
        } else {
            const r = await api('/auth/login', { method: 'POST', body: { email, password } });
            localStorage.setItem('accessToken', r.accessToken);
            $('#authPassword').value = '';
            msg.textContent = '';
            start();
        }
    } catch (err) { msg.textContent = err.message; }
    finally { $('#authSubmit').disabled = false; }
};
$('#logoutBtn').onclick = logout;

// ---------- Navigation ----------
function showTab() {
    let tab = location.hash.slice(1) || 'estoque';
    if (tab === 'usuarios' && !isAdmin) tab = 'estoque';
    document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + tab);
    document.querySelectorAll('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === tab));
}
window.addEventListener('hashchange', showTab);

// ---------- Data ----------
const inStock = () => pecas.filter(p => p.status !== 'vendida');
const sold = () => pecas.filter(p => p.status === 'vendida');
const saleProfit = p => p.lucro != null ? Number(p.lucro) : (p.preco_venda - p.preco_comprado_unitario) * p.quantidade;

async function load() {
    pecas = await api('/pecas');
    for (const p of pecas) {
        p.quantidade = Number(p.quantidade) || 0;
        p.preco_venda = Number(p.preco_venda) || 0;
        p.preco_comprado_unitario = Number(p.preco_comprado_unitario) || 0;
    }
    renderStock();
    renderSales();
    if (isAdmin) loadUsers();
}

// ---------- Estoque ----------
function renderFilters() {
    const items = inStock();
    const sizes = [...new Set(items.map(p => (p.tamanho || '').trim().toUpperCase()).filter(Boolean))].sort();
    const colors = [...new Set(items.map(p => (p.cor || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('#sizeChips').innerHTML = ['', ...sizes].map(s =>
        `<button type="button" data-size="${esc(s)}" aria-pressed="${filters.size === s}">${s ? esc(s) : 'Todos'}</button>`).join('');
    const cur = filters.color;
    $('#colorFilter').innerHTML = '<option value="">Todas as cores</option>' +
        colors.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#colorList').innerHTML = colors.map(c => `<option value="${esc(c)}">`).join('');
    $('#sizeList').innerHTML = sizes.map(s => `<option value="${esc(s)}">`).join('');
}

function renderStock() {
    const all = inStock();
    $('#estPecas').textContent = all.reduce((n, p) => n + p.quantidade, 0);
    $('#estInvestido').textContent = money(all.reduce((n, p) => n + p.preco_comprado_unitario * p.quantidade, 0));
    $('#estPotencial').textContent = money(all.reduce((n, p) => n + (p.preco_venda - p.preco_comprado_unitario) * p.quantidade, 0));
    renderFilters();

    const t = filters.text.toLowerCase();
    const rows = all.filter(p =>
        (!t || `${p.nome} ${p.cor || ''}`.toLowerCase().includes(t)) &&
        (!filters.size || (p.tamanho || '').trim().toUpperCase() === filters.size) &&
        (!filters.color || (p.cor || '').trim() === filters.color) &&
        (!filters.low || p.quantidade <= LOW_STOCK));

    for (const id of selected) if (!rows.some(p => p.id === id)) selected.delete(id);

    $('#stockTable tbody').innerHTML = rows.map(p => {
        const lucro = p.preco_venda - p.preco_comprado_unitario;
        const low = p.quantidade <= LOW_STOCK;
        return `<tr class="${low ? 'low' : ''}">
          <td class="c-check"><input type="checkbox" data-id="${p.id}" ${selected.has(p.id) ? 'checked' : ''} aria-label="Selecionar ${esc(p.nome)}"></td>
          <td><strong>${esc(p.nome)}</strong>${p.cor ? `<span class="sub">${esc(p.cor)}</span>` : ''}</td>
          <td data-l="Tam.">${esc(p.tamanho) || '–'}</td>
          <td class="num" data-l="Qtd."><span>${p.quantidade}${low ? '<span class="tag">baixo</span>' : ''}</span></td>
          <td class="num" data-l="Compra">${money(p.preco_comprado_unitario)}</td>
          <td class="num" data-l="Venda">${money(p.preco_venda)}</td>
          <td data-l="Lucro un." class="num ${lucro < 0 ? 'neg' : ''}">${money(lucro)}</td>
          <td data-l="Comprada em">${fmtDate(p.data_compra)}</td>
          <td class="row-actions">
            <button class="btn btn-primary btn-sm" data-sell="${p.id}">Vender</button>
            <button class="btn-link" data-edit="${p.id}">Editar</button>
          </td></tr>`;
    }).join('');

    const empty = $('#stockEmpty');
    empty.hidden = rows.length > 0;
    empty.textContent = all.length === 0 ? 'Nenhuma peça em estoque. Use "Nova peça" para cadastrar a primeira.'
        : 'Nenhuma peça bate com esses filtros.';
    $('#stockTable').hidden = rows.length === 0;
    $('#selectAll').checked = rows.length > 0 && rows.every(p => selected.has(p.id));
    renderBulk();
}

function renderBulk() {
    $('#bulkBar').hidden = selected.size === 0;
    $('#bulkCount').textContent = `${selected.size} selecionada${selected.size > 1 ? 's' : ''}`;
}

$('#search').oninput = e => { filters.text = e.target.value.trim(); renderStock(); };
$('#colorFilter').onchange = e => { filters.color = e.target.value; renderStock(); };
$('#lowOnly').onchange = e => { filters.low = e.target.checked; renderStock(); };
$('#sizeChips').onclick = e => {
    const b = e.target.closest('button');
    if (b) { filters.size = b.dataset.size; renderStock(); }
};
$('#selectAll').onchange = e => {
    document.querySelectorAll('#stockTable tbody input[data-id]').forEach(c => {
        c.checked = e.target.checked;
        e.target.checked ? selected.add(+c.dataset.id) : selected.delete(+c.dataset.id);
    });
    renderBulk();
};
$('#stockTable tbody').onclick = e => {
    const t = e.target;
    if (t.dataset.id) { t.checked ? selected.add(+t.dataset.id) : selected.delete(+t.dataset.id); renderBulk(); }
    if (t.dataset.sell) openSell(pecas.find(p => p.id === +t.dataset.sell));
    if (t.dataset.edit) openPeca(pecas.find(p => p.id === +t.dataset.edit));
};

// Nova / editar peça
let editing = null;
const pecaFields = { fNome: 'nome', fCor: 'cor', fTam: 'tamanho', fQtd: 'quantidade', fData: 'data_compra', fCompra: 'preco_comprado_unitario', fVenda: 'preco_venda' };
function updateMargem() {
    const c = parseFloat($('#fCompra').value), v = parseFloat($('#fVenda').value);
    $('#fMargem').textContent = c > 0 && v >= 0 ? `Lucro de ${money(v - c)} por peça (${Math.round((v - c) / c * 100)}% sobre a compra)` : '';
}
$('#fCompra').oninput = $('#fVenda').oninput = updateMargem;
function openPeca(p, keepDate) {
    editing = p || null;
    $('#pecaAgain').hidden = !!p;
    $('#pecaTitle').textContent = p ? 'Editar peça' : 'Nova peça';
    for (const [id, key] of Object.entries(pecaFields)) $('#' + id).value = p ? (p[key] ?? '') : '';
    if (!p) { $('#fQtd').value = 1; $('#fData').value = keepDate || today(); }
    $('#pecaMsg').textContent = '';
    updateMargem();
    $('#pecaDialog').showModal();
    $('#fNome').focus();
}
$('#addBtn').onclick = () => openPeca();
document.querySelector('.markup').onclick = e => {
    const mk = parseFloat(e.target.dataset.mk), c = parseFloat($('#fCompra').value);
    if (!mk) return;
    if (!(c > 0)) { $('#pecaMsg').textContent = 'Preencha o preço de compra primeiro.'; $('#fCompra').focus(); return; }
    $('#fVenda').value = (c * mk).toFixed(2);
    $('#pecaMsg').textContent = '';
    updateMargem();
};
$('#pecaForm').onsubmit = async e => {
    const action = e.submitter?.value;
    if (action !== 'ok' && action !== 'again') return;
    e.preventDefault();
    const d = {
        nome: $('#fNome').value.trim(), cor: $('#fCor').value.trim() || null, tamanho: $('#fTam').value.trim().toUpperCase() || null,
        quantidade: parseInt($('#fQtd').value, 10), data_compra: $('#fData').value,
        preco_comprado_unitario: parseFloat($('#fCompra').value), preco_venda: parseFloat($('#fVenda').value),
    };
    const err = !d.nome ? 'Informe o nome da peça.'
        : !(d.quantidade >= 1) ? 'A quantidade precisa ser 1 ou mais.'
        : !d.data_compra ? 'Informe a data da compra.'
        : !(d.preco_comprado_unitario >= 0) || !(d.preco_venda >= 0) ? 'Informe os dois preços (zero ou mais).' : '';
    if (err) { $('#pecaMsg').textContent = err; return; }
    $('#pecaDialog').close();
    if (editing) await run(() => api('/pecas/' + editing.id, { method: 'PUT', body: d }), 'Peça atualizada.');
    else {
        await run(() => api('/pecas', { method: 'POST', body: { ...d, status: 'estoque' } }), `${d.nome} adicionada.`);
        if (action === 'again') openPeca(null, d.data_compra); // same purchase date for the next piece of the batch
    }
};

// Vender
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

let selling = null, sellStock = null;
function fillSelect(sel, values, keep) {
    const uniq = [...new Set(values)];
    sel.innerHTML = uniq.map(v => `<option value="${esc(v)}">${v ? esc(v) : 'Sem informação'}</option>`).join('');
    if (uniq.includes(keep)) sel.value = keep;
    sel.closest('label').hidden = uniq.length === 0 || (uniq.length === 1 && !uniq[0]);
}
function updateVariant() {
    const s = sellStock, p = selling, cor = $('#sCor').value;
    if (s.paired) fillSelect($('#sTam'), s.units.filter(u => u.cor === cor).map(u => u.tam), $('#sTam').value);
    const max = available(s, cor, $('#sTam').value, p.quantidade);
    $('#sQtd').max = max;
    if (+$('#sQtd').value > max) $('#sQtd').value = max;
    const desc = [cor, $('#sTam').value].filter(Boolean).join(', ');
    $('#sInfo').textContent = `${max} ${max === 1 ? 'unidade' : 'unidades'}${desc ? ` em ${desc}` : ''} a ${money(p.preco_venda)}.`;
    updateSell();
}
$('#sCor').onchange = $('#sTam').onchange = updateVariant;
function sellNumbers() {
    const q = parseInt($('#sQtd').value, 10) || 0;
    const desc = Math.min(100, Math.max(0, parseFloat($('#sDesc').value) || 0));
    const unit = +(selling.preco_venda * (1 - desc / 100)).toFixed(2);
    return { q, desc, unit, total: unit * q, lucro: +((unit - selling.preco_comprado_unitario) * q).toFixed(2) };
}
function updateSell() {
    const n = sellNumbers();
    $('#sTotal').textContent = money(n.total);
    $('#sLucro').textContent = `lucro ${money(n.lucro)}`;
}
$('#sQtd').oninput = $('#sDesc').oninput = updateSell;
function openSell(p) {
    selling = p;
    $('#sNome').textContent = p.nome;
    sellStock = stockUnits(p);
    fillSelect($('#sCor'), sellStock.paired ? sellStock.units.map(u => u.cor) : sellStock.c);
    fillSelect($('#sTam'), sellStock.paired ? sellStock.units.map(u => u.tam) : sellStock.t);
    $('#sQtd').value = 1;
    $('#sDesc').value = 0;
    $('#sData').value = today();
    $('#sellMsg').textContent = '';
    updateVariant();
    $('#sellDialog').showModal();
}
$('#sellForm').onsubmit = async e => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const n = sellNumbers(), p = selling, data_venda = $('#sData').value;
    const cor = $('#sCor').value, tam = $('#sTam').value, max = available(sellStock, cor, tam, p.quantidade);
    if (n.q < 1 || n.q > max) { $('#sellMsg').textContent = max ? `Venda de 1 a ${max} unidades nessa cor e tamanho.` : 'Não há unidades nessa cor e tamanho.'; return; }
    if (!data_venda) { $('#sellMsg').textContent = 'Informe a data da venda.'; return; }
    $('#sellDialog').close();
    const sale = { status: 'vendida', data_venda, desconto: n.desc, preco_venda: n.unit, lucro: n.lucro, quantidade: n.q, cor: cor || null, tamanho: tam || null };
    const rest = afterSale(sellStock, cor, tam, n.q);
    await run(async () => {
        if (n.q === p.quantidade) return api('/pecas/' + p.id, { method: 'PUT', body: sale });
        // Partial sale: create the sold row first, so a failure never loses stock.
        await api('/pecas', { method: 'POST', body: { nome: p.nome, data_compra: p.data_compra, preco_comprado_unitario: p.preco_comprado_unitario, ...sale } });
        await api('/pecas/' + p.id, { method: 'PUT', body: { quantidade: p.quantidade - n.q, ...rest } });
    }, `Venda registrada: ${money(n.total)}.`);
};

$('#bulkSell').onclick = async () => {
    const list = pecas.filter(p => selected.has(p.id));
    const total = list.reduce((n, p) => n + p.preco_venda * p.quantidade, 0);
    if (!await confirmAction('Vender selecionadas', `Registrar a venda de todas as unidades de ${list.length} peça(s), sem desconto, com data de hoje? Total ${money(total)}.`, 'Registrar venda')) return;
    selected.clear();
    await run(() => Promise.all(list.map(p => api('/pecas/' + p.id, { method: 'PUT', body: {
        status: 'vendida', data_venda: today(), desconto: 0, lucro: +((p.preco_venda - p.preco_comprado_unitario) * p.quantidade).toFixed(2) } }))),
    'Vendas registradas.');
};
$('#bulkDelete').onclick = async () => {
    const ids = [...selected];
    if (!await confirmAction('Apagar peças', `Apagar ${ids.length} peça(s) do estoque? Isso não pode ser desfeito.`, 'Apagar')) return;
    selected.clear();
    await run(() => api('/pecas/batch', { method: 'PATCH', body: { ids, action: 'delete' } }), 'Peças apagadas.');
};

// ---------- Vendas ----------
let month = today().slice(0, 7);
let oldMonths = []; // months saved by the old app's historico_mensal table, read-only

function monthTotals() {
    const map = {};
    for (const p of sold()) {
        if (!p.data_venda) continue;
        const k = p.data_venda.slice(0, 7);
        const m = map[k] ||= { fat: 0, lucro: 0, pecas: 0 };
        m.fat += p.preco_venda * p.quantidade; m.lucro += saleProfit(p); m.pecas += p.quantidade;
    }
    for (const h of oldMonths) { // old format "MM/YYYY"; computed months win
        const [mm, yy] = String(h.mes_ano).split('/');
        const k = `${yy}-${mm?.padStart(2, '0')}`;
        if (yy && !map[k]) map[k] = { fat: +h.faturamento || 0, lucro: +h.lucro || 0, pecas: +h.pecas_vendidas || 0, old: true };
    }
    return map;
}

function renderSales() {
    const totals = monthTotals();
    const keys = Object.keys(totals).sort();
    if (month !== 'all' && !totals[month] && keys.length) month = keys[keys.length - 1];

    $('#monthSelect').innerHTML = '<option value="all">Todo o período</option>' +
        [...keys].reverse().map(k => `<option value="${k}" ${k === month ? 'selected' : ''}>${monthLabel(k)}</option>`).join('');
    if (month === 'all') $('#monthSelect').value = 'all';

    const pick = month === 'all' ? keys.map(k => totals[k]) : [totals[month] || { fat: 0, lucro: 0, pecas: 0 }];
    $('#venFaturado').textContent = money(pick.reduce((n, m) => n + m.fat, 0));
    $('#venLucro').textContent = money(pick.reduce((n, m) => n + m.lucro, 0));
    $('#venPecas').textContent = pick.reduce((n, m) => n + m.pecas, 0);

    const last = keys.slice(-12), max = Math.max(1, ...last.map(k => Math.abs(totals[k].lucro)));
    $('#monthBars').innerHTML = last.map(k => `<button type="button" data-month="${k}" aria-pressed="${k === month}" title="${monthLabel(k)}: lucro ${money(totals[k].lucro)}">
        <span class="bar" style="--h:${Math.round(Math.abs(totals[k].lucro) / max * 100)}%"></span>
        <span class="bar-label">${monthLabel(k).replace(' ', '<br>')}</span></button>`).join('');

    const rows = sold().filter(p => month === 'all' || (p.data_venda || '').startsWith(month))
        .sort((a, b) => (b.data_venda || '').localeCompare(a.data_venda || ''));
    $('#salesTable tbody').innerHTML = rows.map(p => {
        const l = saleProfit(p);
        return `<tr>
          <td>${fmtDate(p.data_venda)}</td>
          <td><strong>${esc(p.nome)}</strong>${p.cor ? `<span class="sub">${esc(p.cor)}</span>` : ''}</td>
          <td data-l="Tam.">${esc(p.tamanho) || '–'}</td>
          <td class="num" data-l="Qtd.">${p.quantidade}</td>
          <td class="num" data-l="Desconto">${p.desconto ? `${+p.desconto}%` : '–'}</td>
          <td class="num" data-l="Total">${money(p.preco_venda * p.quantidade)}</td>
          <td data-l="Lucro" class="num ${l < 0 ? 'neg' : ''}">${money(l)}</td>
          <td class="row-actions"><button class="btn-link" data-undo="${p.id}">Desfazer venda</button></td></tr>`;
    }).join('');
    const old = totals[month]?.old;
    $('#salesEmpty').hidden = rows.length > 0;
    $('#salesEmpty').textContent = old ? 'Este mês veio do sistema antigo: só os totais foram guardados, sem as peças.' : 'Nenhuma venda neste período.';
    $('#salesTable').hidden = rows.length === 0;
}
$('#monthSelect').onchange = e => { month = e.target.value; renderSales(); };
$('#monthBars').onclick = e => { const b = e.target.closest('button'); if (b) { month = b.dataset.month; renderSales(); } };
$('#salesTable tbody').onclick = async e => {
    const id = +e.target.dataset.undo;
    if (!id) return;
    const p = pecas.find(x => x.id === id);
    if (!await confirmAction('Desfazer venda', `Devolver ${p.quantidade}× ${p.nome} ao estoque e apagar esta venda?`, 'Devolver ao estoque')) return;
    const d = Number(p.desconto) || 0;
    const preco = d > 0 && d < 100 ? +(p.preco_venda / (1 - d / 100)).toFixed(2) : p.preco_venda; // restore list price
    await run(() => api('/pecas/' + id, { method: 'PUT', body: { status: 'estoque', data_venda: null, desconto: null, lucro: null, preco_venda: preco } }), 'Peça devolvida ao estoque.');
};

// ---------- Usuários ----------
const STATUS = { active: 'Ativo', pending: 'Aguardando', rejected: 'Recusado' };
async function loadUsers() {
    const users = await api('/admin/users');
    const pending = users.filter(u => u.status === 'pending').length;
    $('#pendingBadge').hidden = !pending;
    $('#pendingBadge').textContent = pending;
    users.sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
    $('#userList').innerHTML = users.map(u => `<li class="${u.status}">
        <span><strong>${esc(u.email)}</strong><span class="sub">${STATUS[u.status] || esc(u.status)} desde ${fmtDate(u.created_at)}</span></span>
        <span class="row-actions">
          ${u.status !== 'active' ? `<button class="btn btn-primary btn-sm" data-uid="${u.id}" data-st="active">Aprovar</button>` : ''}
          ${u.status !== 'rejected' ? `<button class="btn-link" data-uid="${u.id}" data-st="rejected">${u.status === 'active' ? 'Bloquear' : 'Recusar'}</button>` : ''}
        </span></li>`).join('');
    $('#usersEmpty').hidden = users.length > 0;
}
$('#userList').onclick = async e => {
    const { uid, st } = e.target.dataset;
    if (!uid) return;
    try { await api('/admin/users/' + uid, { method: 'PATCH', body: { status: st } }); toast(st === 'active' ? 'Acesso aprovado.' : 'Acesso bloqueado.'); await loadUsers(); }
    catch (err) { toast(err.message, true); }
};

// ---------- Tema ----------
function setTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelectorAll('[data-theme-toggle]').forEach(b => b.textContent = t === 'dark' ? 'Modo claro' : 'Modo escuro');
}
let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch {}
setTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
document.querySelectorAll('[data-theme-toggle]').forEach(b => b.onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    try { localStorage.setItem('theme', t); } catch {}
});

// ---------- Start ----------
async function start() {
    $('#authView').hidden = true;
    $('#appView').hidden = false;
    try {
        isAdmin = await api('/admin/users').then(() => true, () => false);
        $('#tabUsuarios').hidden = !isAdmin;
        oldMonths = await api('/historico').catch(() => []);
        showTab();
        await load();
    } catch (e) { toast(e.message, true); }
}
localStorage.getItem('accessToken') ? start() : showAuth();
