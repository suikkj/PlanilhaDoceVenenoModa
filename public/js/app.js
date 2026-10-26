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
const filters = { text: '', size: '', color: '', low: false, stale: false, sort: 'recent' };
let salesSort = 'recent';
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
// Modes: login, register, forgot (ask for the reset email), reset (new password from an emailed link).
let authMode = 'login';
const resetToken = new URLSearchParams(location.search).get('reset');
const AUTH = {
    login: { title: 'Entrar', submit: 'Entrar', toggle: 'Não tem conta? Criar conta', pw: 'Senha', ac: 'current-password' },
    register: { title: 'Criar conta', submit: 'Criar conta', toggle: 'Já tem conta? Entrar', pw: 'Senha', ac: 'new-password' },
    forgot: { title: 'Esqueci minha senha', submit: 'Enviar link', toggle: 'Lembrei a senha. Entrar',
        hint: 'Informe seu email. Vamos enviar um link para você criar uma nova senha.' },
    reset: { title: 'Criar nova senha', submit: 'Salvar nova senha', toggle: 'Voltar para entrar', pw: 'Nova senha', ac: 'new-password',
        hint: 'Escolha uma senha com pelo menos 6 caracteres.' },
};
function setAuthMode(mode, keepMsg) {
    authMode = mode;
    const m = AUTH[mode];
    $('#authTitle').textContent = m.title;
    $('#authSubmit').textContent = m.submit;
    $('#authToggle').textContent = m.toggle;
    $('#authHint').hidden = !m.hint;
    $('#authHint').textContent = m.hint || '';
    $('#authEmailField').hidden = mode === 'reset';
    $('#authPwField').hidden = mode === 'forgot';
    $('#forgotLink').hidden = mode !== 'login';
    if (m.pw) { $('#authPwLabel').textContent = m.pw; $('#authPassword').autocomplete = m.ac; }
    if (!keepMsg) $('#authMsg').textContent = '';
}
function showAuth() {
    $('#appView').hidden = true;
    $('#authView').hidden = false;
    setAuthMode(resetToken ? 'reset' : 'login');
    (resetToken ? $('#authPassword') : $('#authEmail')).focus();
}
function logout() {
    localStorage.removeItem('accessToken');
    showAuth();
}
$('#authToggle').onclick = () => {
    if (authMode === 'reset') history.replaceState(null, '', location.pathname); // leave the reset link behind
    setAuthMode(authMode === 'login' ? 'register' : 'login');
};
$('#forgotLink').onclick = () => { setAuthMode('forgot'); $('#authEmail').focus(); };
$('#pwToggle').onclick = () => {
    const show = $('#authPassword').type === 'password';
    $('#authPassword').type = show ? 'text' : 'password';
    $('#pwToggle').textContent = show ? 'Ocultar' : 'Mostrar';
    $('#pwToggle').setAttribute('aria-pressed', show);
    $('#authPassword').focus();
};
$('#authForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#authMsg');
    const email = $('#authEmail').value.trim(), password = $('#authPassword').value;
    if (authMode !== 'reset' && !email) { msg.textContent = 'Informe seu email.'; return; }
    if (authMode !== 'forgot' && password.length < 6) { msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
    $('#authSubmit').disabled = true;
    try {
        if (authMode === 'register') {
            const r = await api('/auth/register', { method: 'POST', body: { email, password } });
            setAuthMode('login');
            msg.textContent = r.message;
        } else if (authMode === 'forgot') {
            const r = await api('/auth/forgot', { method: 'POST', body: { email } });
            setAuthMode('login', true);
            msg.textContent = r.message;
        } else if (authMode === 'reset') {
            const r = await api('/auth/reset', { method: 'POST', body: { token: resetToken, password } });
            history.replaceState(null, '', location.pathname);
            $('#authPassword').value = '';
            setAuthMode('login');
            msg.textContent = r.message;
            $('#authEmail').focus();
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
const STALE_DAYS = 60;
const isStale = p => !!p.data_compra && (Date.now() - new Date(p.data_compra + 'T00:00:00')) / 864e5 > STALE_DAYS;
// Columns added by the 2026-10-25 migration: their fields only show once they exist in the database.
const hasCol = k => pecas.some(p => k in p);
const uniq = l => [...new Set(l)];
const uniqJoin = v => uniq(splitList(v)).join(', ');
// how: 'recent' | 'old' | 'az'. Rows without a date go last in both date orders.
function sortRows(rows, how, dateKey) {
    const byName = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' });
    const d = p => p[dateKey] || (how === 'old' ? '9999' : '');
    const cmp = how === 'az' ? byName
        : how === 'old' ? (a, b) => d(a).localeCompare(d(b)) || byName(a, b)
        : (a, b) => d(b).localeCompare(d(a)) || byName(a, b);
    return [...rows].sort(cmp);
}

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
    const sizes = uniq(items.flatMap(p => splitList(p.tamanho).map(t => t.toUpperCase()))).sort();
    const colors = uniq(items.flatMap(p => splitList(p.cor))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('#sizeChips').innerHTML = ['', ...sizes].map(s =>
        `<button type="button" data-size="${esc(s)}" aria-pressed="${filters.size === s}">${s ? esc(s) : 'Todos'}</button>`).join('');
    const cur = filters.color;
    $('#colorFilter').innerHTML = '<option value="">Todas as cores</option>' +
        colors.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#colorList').innerHTML = colors.map(c => `<option value="${esc(c)}">`).join('');
    $('#sizeList').innerHTML = sizes.map(s => `<option value="${esc(s)}">`).join('');
    $('#fornList').innerHTML = uniq(pecas.map(p => p.fornecedor).filter(Boolean)).map(f => `<option value="${esc(f)}">`).join('');
}

function renderStock() {
    const all = inStock();
    $('#estPecas').textContent = all.reduce((n, p) => n + p.quantidade, 0);
    $('#estInvestido').textContent = money(all.reduce((n, p) => n + p.preco_comprado_unitario * p.quantidade, 0));
    $('#estPotencial').textContent = money(all.reduce((n, p) => n + (p.preco_venda - p.preco_comprado_unitario) * p.quantidade, 0));
    renderFilters();

    const t = filters.text.toLowerCase();
    const rows = sortRows(all, filters.sort, 'data_compra').filter(p =>
        (!t || `${p.nome} ${p.cor || ''}`.toLowerCase().includes(t)) &&
        (!filters.size || splitList(p.tamanho).some(t => t.toUpperCase() === filters.size)) &&
        (!filters.color || splitList(p.cor).includes(filters.color)) &&
        (!filters.low || p.quantidade <= LOW_STOCK) &&
        (!filters.stale || isStale(p)));

    for (const id of selected) if (!rows.some(p => p.id === id)) selected.delete(id);

    $('#stockTable tbody').innerHTML = rows.map(p => {
        const lucro = p.preco_venda - p.preco_comprado_unitario;
        const low = p.quantidade <= LOW_STOCK;
        return `<tr class="${low ? 'low' : ''}">
          <td class="c-check"><input type="checkbox" data-id="${p.id}" ${selected.has(p.id) ? 'checked' : ''} aria-label="Selecionar ${esc(p.nome)}"></td>
          <td><strong>${esc(p.nome)}</strong>${p.cor ? `<span class="sub">${esc(uniqJoin(p.cor))}</span>` : ''}</td>
          <td data-l="Tam.">${esc(uniqJoin(p.tamanho)) || '–'}</td>
          <td class="num" data-l="Qtd."><span>${p.quantidade}${low ? '<span class="tag">baixo</span>' : ''}</span></td>
          <td class="num" data-l="Compra">${money(p.preco_comprado_unitario)}</td>
          <td class="num" data-l="Venda">${money(p.preco_venda)}</td>
          <td data-l="Lucro un." class="num ${lucro < 0 ? 'neg' : ''}">${money(lucro)}</td>
          <td data-l="Comprada em"><span>${fmtDate(p.data_compra)}${isStale(p) ? '<span class="tag">parada</span>' : ''}</span></td>
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
$('#staleOnly').onchange = e => { filters.stale = e.target.checked; renderStock(); };
$('#stockSort').onchange = e => { filters.sort = e.target.value; renderStock(); };
$('#salesSort').onchange = e => { salesSort = e.target.value; renderSales(); };
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
const pecaFields = { fNome: 'nome', fData: 'data_compra', fCompra: 'preco_comprado_unitario', fVenda: 'preco_venda', fForn: 'fornecedor' };

// Grade: one row per color/size combination; saved as the per-unit comma lists the rest of the app uses.
function gradeFromPiece(p) {
    const c = splitList(p.cor), t = splitList(p.tamanho);
    const at = (l, i) => l.length === 1 ? l[0] : (l[i] || '');
    const rows = [];
    for (let i = 0; i < p.quantidade; i++) {
        const cor = at(c, i), tam = at(t, i).toUpperCase();
        const r = rows.find(r => r.cor === cor && r.tam === tam);
        r ? r.qtd++ : rows.push({ cor, tam, qtd: 1 });
    }
    return rows.length ? rows : [{ cor: '', tam: '', qtd: 1 }];
}
function gradeToPiece(rows) {
    const cores = [], tams = [];
    for (const r of rows) for (let i = 0; i < r.qtd; i++) { cores.push(r.cor); tams.push(r.tam); }
    return { cor: rows.some(r => r.cor) ? joinList(cores) : null, tamanho: rows.some(r => r.tam) ? joinList(tams) : null, quantidade: cores.length };
}
function gradeError(rows) {
    if (rows.some(r => !(Number.isInteger(r.qtd) && r.qtd >= 1))) return 'Cada linha precisa de quantidade 1 ou mais.';
    if (rows.some(r => /,/.test(r.cor + r.tam))) return 'Use uma cor e um tamanho por linha, sem vírgula.';
    if (rows.some(r => r.cor) && rows.some(r => !r.cor)) return 'Preencha a cor em todas as linhas, ou deixe todas sem cor.';
    if (rows.some(r => r.tam) && rows.some(r => !r.tam)) return 'Preencha o tamanho em todas as linhas, ou deixe todas sem tamanho.';
    return '';
}
function addGradeRow(r = { cor: '', tam: '', qtd: 1 }) {
    const n = $('#gradeRows').children.length + 1;
    const row = document.createElement('div');
    row.className = 'grade-row';
    row.innerHTML = `<input class="g-cor" list="colorList" aria-label="Cor, linha ${n}" value="${esc(r.cor)}">
      <input class="g-tam" list="sizeList" aria-label="Tamanho, linha ${n}" value="${esc(r.tam)}">
      <input class="g-qtd" type="number" min="1" inputmode="numeric" aria-label="Quantidade, linha ${n}" value="${r.qtd}">
      <button type="button" class="btn-link g-del" aria-label="Remover linha ${n}">Remover</button>`;
    $('#gradeRows').append(row);
    updateGrade();
    return row;
}
const readGrade = () => [...$('#gradeRows').children].map(r => ({
    cor: r.querySelector('.g-cor').value.trim(), tam: r.querySelector('.g-tam').value.trim().toUpperCase(),
    qtd: parseInt(r.querySelector('.g-qtd').value, 10),
}));
function updateGrade() {
    const total = readGrade().reduce((n, r) => n + (r.qtd > 0 ? r.qtd : 0), 0);
    $('#gradeTotal').textContent = `${total} ${total === 1 ? 'peça' : 'peças'} no total`;
    const only = $('#gradeRows').children.length === 1;
    document.querySelectorAll('.g-del').forEach(b => b.hidden = only);
}
$('#gradeAdd').onclick = () => {
    const last = readGrade().at(-1);
    addGradeRow({ cor: last?.cor || '', tam: '', qtd: 1 }).querySelector('.g-tam').focus(); // same color, next size is the common case
};
$('#gradeRows').oninput = updateGrade;
$('#gradeRows').onclick = e => { if (e.target.classList.contains('g-del')) { e.target.closest('.grade-row').remove(); updateGrade(); } };
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
    if (!p) $('#fData').value = keepDate || today();
    $('#fFornWrap').hidden = !hasCol('fornecedor');
    $('#gradeRows').innerHTML = '';
    (p ? gradeFromPiece(p) : [undefined]).forEach(r => addGradeRow(r));
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
    const grade = readGrade();
    const d = {
        nome: $('#fNome').value.trim(), data_compra: $('#fData').value,
        preco_comprado_unitario: parseFloat($('#fCompra').value), preco_venda: parseFloat($('#fVenda').value),
        ...gradeToPiece(grade),
    };
    if (hasCol('fornecedor')) d.fornecedor = $('#fForn').value.trim() || null;
    const err = !d.nome ? 'Informe o nome da peça.'
        : gradeError(grade)
        || (!d.data_compra ? 'Informe a data da compra.'
        : !(d.preco_comprado_unitario >= 0) || !(d.preco_venda >= 0) ? 'Informe os dois preços (zero ou mais).' : '');
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
const initVariant = (el, stock) => {
    fillSelect(el.querySelector('.v-cor'), stock.paired ? stock.units.map(u => u.cor) : stock.c);
    fillSelect(el.querySelector('.v-tam'), stock.paired ? stock.units.map(u => u.tam) : stock.t);
};
// Keeps one piece's color/size/quantity inputs consistent; shared by the single and the bulk sale.
function syncVariant(el, p, stock) {
    const cor = el.querySelector('.v-cor'), tam = el.querySelector('.v-tam'), qtd = el.querySelector('.v-qtd');
    if (stock.paired) fillSelect(tam, stock.units.filter(u => u.cor === cor.value).map(u => u.tam), tam.value);
    const max = available(stock, cor.value, tam.value, p.quantidade);
    qtd.max = max;
    if (+qtd.value > max) qtd.value = max;
    return { cor: cor.value, tam: tam.value, q: parseInt(qtd.value, 10) || 0, max };
}
function updateVariant() {
    const v = syncVariant($('#sellForm'), selling, sellStock);
    const desc = [v.cor, v.tam].filter(Boolean).join(', ');
    $('#sInfo').textContent = `${v.max} ${v.max === 1 ? 'unidade' : 'unidades'}${desc ? ` em ${desc}` : ''} a ${money(selling.preco_venda)}.`;
    updateSell();
}
$('#sCor').onchange = $('#sTam').onchange = updateVariant;
// Returning customer: fill in the phone used last time.
const fillPhone = (nome, tel) => () => {
    const last = sold().find(x => x.cliente_nome === nome.value.trim() && x.cliente_telefone);
    if (last && !tel.value) tel.value = last.cliente_telefone;
};
$('#sCli').onchange = fillPhone($('#sCli'), $('#sTel'));
const discount = el => Math.min(100, Math.max(0, parseFloat(el.value) || 0));
const unitPrice = (p, desc) => +(p.preco_venda * (1 - desc / 100)).toFixed(2);
function sellNumbers() {
    const q = parseInt($('#sQtd').value, 10) || 0, desc = discount($('#sDesc')), unit = unitPrice(selling, desc);
    return { q, desc, unit, total: unit * q, lucro: +((unit - selling.preco_comprado_unitario) * q).toFixed(2) };
}
function updateSell() {
    const n = sellNumbers();
    $('#sTotal').textContent = money(n.total);
    $('#sLucro').textContent = `lucro ${money(n.lucro)}`;
}
$('#sQtd').oninput = $('#sDesc').oninput = updateSell;

// Optional sale fields (payment, customer) for the single and the bulk dialog.
function prepareSaleFields(pay, cli, tel) {
    pay.value = ''; cli.value = tel.value = '';
    pay.closest('label').hidden = !hasCol('forma_pagamento');
    cli.closest('label').hidden = tel.closest('label').hidden = !hasCol('cliente_nome');
    $('#clienteList').innerHTML = uniq(sold().map(x => x.cliente_nome).filter(Boolean)).map(c => `<option value="${esc(c)}">`).join('');
}
const saleFields = (pay, cli, tel) => ({
    ...(hasCol('forma_pagamento') && { forma_pagamento: pay.value || null }),
    ...(hasCol('cliente_nome') && { cliente_nome: cli.value.trim() || null, cliente_telefone: tel.value.trim() || null }),
});
// Registers the sale of q units of one color/size of piece p.
async function registerSale(p, stock, cor, tam, q, desc, data_venda, extra) {
    const unit = unitPrice(p, desc);
    const sale = { status: 'vendida', data_venda, desconto: desc, preco_venda: unit, lucro: +((unit - p.preco_comprado_unitario) * q).toFixed(2),
        quantidade: q, cor: cor || null, tamanho: tam || null, ...extra, ...(hasCol('fornecedor') && { fornecedor: p.fornecedor ?? null }) };
    if (q === p.quantidade) return api('/pecas/' + p.id, { method: 'PUT', body: sale });
    // Partial sale: create the sold row first, so a failure never loses stock.
    await api('/pecas', { method: 'POST', body: { nome: p.nome, data_compra: p.data_compra, preco_comprado_unitario: p.preco_comprado_unitario, ...sale } });
    await api('/pecas/' + p.id, { method: 'PUT', body: { quantidade: p.quantidade - q, ...afterSale(stock, cor, tam, q) } });
}

function openSell(p) {
    selling = p;
    $('#sNome').textContent = p.nome;
    sellStock = stockUnits(p);
    initVariant($('#sellForm'), sellStock);
    $('#sQtd').value = 1;
    $('#sDesc').value = 0;
    $('#sData').value = today();
    prepareSaleFields($('#sPay'), $('#sCli'), $('#sTel'));
    $('#sellMsg').textContent = '';
    updateVariant();
    $('#sellDialog').showModal();
}
$('#sellForm').onsubmit = async e => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const n = sellNumbers(), p = selling, data_venda = $('#sData').value;
    const v = syncVariant($('#sellForm'), p, sellStock);
    if (n.q < 1 || n.q > v.max) { $('#sellMsg').textContent = v.max ? `Venda de 1 a ${v.max} unidades nessa cor e tamanho.` : 'Não há unidades nessa cor e tamanho.'; return; }
    if (!data_venda) { $('#sellMsg').textContent = 'Informe a data da venda.'; return; }
    $('#sellDialog').close();
    await run(() => registerSale(p, sellStock, v.cor, v.tam, n.q, n.desc, data_venda, saleFields($('#sPay'), $('#sCli'), $('#sTel'))),
        `Venda registrada: ${money(n.total)}.`);
};

// Venda em lote: each selected piece gets its own color, size and quantity; date, discount, payment and customer are shared.
let bulkItems = [];
$('#bPay').innerHTML = $('#sPay').innerHTML;
function updateBulk() {
    const desc = discount($('#bDesc'));
    let total = 0, lucro = 0;
    for (const it of bulkItems) {
        const v = syncVariant(it.el, it.p, it.stock), unit = unitPrice(it.p, desc);
        it.el.querySelector('.bulk-left').textContent = `${v.max} ${v.max === 1 ? 'disponível' : 'disponíveis'}, ${money(unit)} cada`;
        total += unit * v.q; lucro += (unit - it.p.preco_comprado_unitario) * v.q;
    }
    $('#bTotal').textContent = money(total);
    $('#bLucro').textContent = `lucro ${money(lucro)}`;
}
$('#bulkSell').onclick = () => {
    const list = pecas.filter(p => selected.has(p.id));
    $('#bTitle').textContent = `Vender ${list.length} ${list.length === 1 ? 'peça' : 'peças'}`;
    $('#bulkItems').innerHTML = '';
    bulkItems = list.map(p => {
        const el = document.createElement('div');
        el.className = 'bulk-item';
        el.innerHTML = `<p class="bulk-name"><strong>${esc(p.nome)}</strong><small class="bulk-left"></small></p>
          <label>Cor <select class="v-cor"></select></label>
          <label>Tamanho <select class="v-tam"></select></label>
          <label>Qtd. <input class="v-qtd" type="number" min="1" value="1"></label>`;
        $('#bulkItems').append(el);
        const stock = stockUnits(p);
        initVariant(el, stock);
        return { p, stock, el };
    });
    $('#bDesc').value = 0;
    $('#bData').value = today();
    prepareSaleFields($('#bPay'), $('#bCli'), $('#bTel'));
    $('#bulkMsg').textContent = '';
    updateBulk();
    $('#bulkDialog').showModal();
};
$('#bulkItems').onchange = $('#bulkItems').oninput = $('#bDesc').oninput = updateBulk;
$('#bCli').onchange = fillPhone($('#bCli'), $('#bTel'));
$('#bulkForm').onsubmit = async e => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const desc = discount($('#bDesc')), data_venda = $('#bData').value;
    const sales = bulkItems.map(it => ({ ...it, ...syncVariant(it.el, it.p, it.stock) }));
    const bad = sales.find(s => s.q < 1 || s.q > s.max);
    if (bad) { $('#bulkMsg').textContent = `${bad.p.nome}: venda de 1 a ${bad.max} unidades nessa cor e tamanho.`; return; }
    if (!data_venda) { $('#bulkMsg').textContent = 'Informe a data da venda.'; return; }
    $('#bulkDialog').close();
    selected.clear();
    const extra = saleFields($('#bPay'), $('#bCli'), $('#bTel'));
    // One after another, so a failure stops the batch at a clear point instead of leaving half-written pieces.
    await run(async () => { for (const s of sales) await registerSale(s.p, s.stock, s.cor, s.tam, s.q, desc, data_venda, extra); },
        `${sales.length} ${sales.length === 1 ? 'venda registrada' : 'vendas registradas'}.`);
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

    const rows = sortRows(sold().filter(p => month === 'all' || (p.data_venda || '').startsWith(month)), salesSort, 'data_venda');
    $('#salesTable tbody').innerHTML = rows.map(p => {
        const l = saleProfit(p);
        return `<tr>
          <td>${fmtDate(p.data_venda)}</td>
          <td><strong>${esc(p.nome)}</strong>${saleSub(p) ? `<span class="sub">${esc(saleSub(p))}</span>` : ''}</td>
          <td data-l="Tam.">${esc(uniqJoin(p.tamanho)) || '–'}</td>
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
    salesRows = rows;
    $('#exportBtn').disabled = rows.length === 0;
    renderRanks(rows);
}

const PAY = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' };
const saleSub = p => [uniqJoin(p.cor), p.cliente_nome && `para ${p.cliente_nome}`, PAY[p.forma_pagamento]].filter(Boolean).join(', ');
let salesRows = [];

// Rankings for the selected period. Each list only appears when it has data.
function rankBy(rows, key) {
    const m = new Map();
    for (const p of rows) {
        const k = key(p);
        if (!k) continue;
        const r = m.get(k) || { k, qtd: 0, fat: 0, lucro: 0 };
        r.qtd += p.quantidade; r.fat += p.preco_venda * p.quantidade; r.lucro += saleProfit(p);
        m.set(k, r);
    }
    return [...m.values()];
}
function renderRanks(rows) {
    const pct = r => r.fat > 0 ? ` (${Math.round(r.lucro / r.fat * 100)}% de margem)` : '';
    const lists = [
        ['Mais vendidas', rankBy(rows, p => p.nome).sort((a, b) => b.qtd - a.qtd || b.fat - a.fat),
            r => `${r.qtd} ${r.qtd === 1 ? 'peça' : 'peças'}, ${money(r.fat)}${pct(r)}`],
        ['Melhores clientes', rankBy(rows, p => p.cliente_nome).sort((a, b) => b.fat - a.fat),
            r => `${money(r.fat)} em ${r.qtd} ${r.qtd === 1 ? 'peça' : 'peças'}`],
        ['Lucro por fornecedor', rankBy(rows, p => p.fornecedor).sort((a, b) => b.lucro - a.lucro),
            r => `lucro ${money(r.lucro)}${pct(r)}`],
        ['Por forma de pagamento', rankBy(rows, p => PAY[p.forma_pagamento]).sort((a, b) => b.fat - a.fat),
            r => money(r.fat)],
    ].filter(([, items]) => items.length);
    $('#ranks').innerHTML = lists.map(([title, items, fmt]) => `<section class="rank">
        <h3>${title}</h3>
        <ol>${items.slice(0, 5).map(r => `<li><span>${esc(r.k)}</span><small>${fmt(r)}</small></li>`).join('')}</ol>
      </section>`).join('');
}

// Spreadsheet export of the period's sales. Semicolons and a BOM so Excel in Portuguese opens it directly.
function salesCsv(rows) {
    const num = v => (Number(v) || 0).toFixed(2).replace('.', ',');
    const cell = v => /[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
    const head = ['Data', 'Peça', 'Cor', 'Tamanho', 'Quantidade', 'Desconto %', 'Preço unitário', 'Total', 'Custo', 'Lucro', 'Pagamento', 'Cliente', 'Telefone', 'Fornecedor'];
    const body = rows.map(p => [fmtDate(p.data_venda), p.nome, uniqJoin(p.cor), uniqJoin(p.tamanho), p.quantidade, p.desconto || 0,
        num(p.preco_venda), num(p.preco_venda * p.quantidade), num(p.preco_comprado_unitario * p.quantidade), num(saleProfit(p)),
        PAY[p.forma_pagamento] || '', p.cliente_nome || '', p.cliente_telefone || '', p.fornecedor || '']);
    return '\ufeff' + [head, ...body].map(r => r.map(cell).join(';')).join('\r\n');
}
$('#exportBtn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([salesCsv(salesRows)], { type: 'text/csv;charset=utf-8' }));
    a.download = `vendas-doce-veneno-${month === 'all' ? 'todo-periodo' : month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#monthSelect').onchange = e => { month = e.target.value; renderSales(); };
$('#monthBars').onclick = e => { const b = e.target.closest('button'); if (b) { month = b.dataset.month; renderSales(); } };
$('#salesTable tbody').onclick = async e => {
    const id = +e.target.dataset.undo;
    if (!id) return;
    const p = pecas.find(x => x.id === id);
    if (!await confirmAction('Desfazer venda', `Devolver ${p.quantidade}× ${p.nome} ao estoque e apagar esta venda?`, 'Devolver ao estoque')) return;
    const d = Number(p.desconto) || 0;
    const preco = d > 0 && d < 100 ? +(p.preco_venda / (1 - d / 100)).toFixed(2) : p.preco_venda; // restore list price
    const body = { status: 'estoque', data_venda: null, desconto: null, lucro: null, preco_venda: preco };
    for (const k of ['forma_pagamento', 'cliente_nome', 'cliente_telefone']) if (hasCol(k)) body[k] = null;
    await run(() => api('/pecas/' + id, { method: 'PUT', body }), 'Peça devolvida ao estoque.');
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
          ${u.status === 'active' ? `<button class="btn-link" data-temp="${u.id}">Gerar senha temporária</button>` : ''}
          ${u.status !== 'rejected' ? `<button class="btn-link" data-uid="${u.id}" data-st="rejected">${u.status === 'active' ? 'Bloquear' : 'Recusar'}</button>` : ''}
        </span></li>`).join('');
    $('#usersEmpty').hidden = users.length > 0;
}
function showInfo(title, text, code) {
    $('#iTitle').textContent = title;
    $('#iText').textContent = text;
    $('#iCode').textContent = code || '';
    $('#iCode').hidden = !code;
    $('#infoDialog').showModal();
}
$('#userList').onclick = async e => {
    const { uid, st, temp } = e.target.dataset;
    if (temp) {
        if (!await confirmAction('Gerar senha temporária', 'A senha atual dessa pessoa deixa de funcionar. Continuar?', 'Gerar senha')) return;
        try {
            const r = await api(`/admin/users/${temp}/temp-password`, { method: 'POST' });
            showInfo('Senha temporária', `Passe esta senha para ${r.email}. Ela não será mostrada de novo. Para trocar por uma senha própria, a pessoa usa "Esqueci minha senha".`, r.password);
        } catch (err) { toast(err.message, true); }
        return;
    }
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

// ---------- Planilha completa ----------
$('#exportAllBtn').onclick = async () => {
    const btn = $('#exportAllBtn');
    btn.disabled = true;
    try {
        const res = await fetch(API_BASE_URL + '/export', { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
        if (res.status === 401) { logout(); throw new Error('Sua sessão expirou. Entre de novo.'); }
        if (!res.ok) throw new Error('Não foi possível gerar a planilha. Tente de novo.');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(await res.blob());
        a.download = `doce-veneno-completo-${today()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
};

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
localStorage.getItem('accessToken') && !resetToken ? start() : showAuth(); // a reset link always opens the new-password screen
