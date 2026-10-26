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
const OFFLINE_MSG = 'Sem conexão com a internet. Tente de novo quando a conexão voltar.';
async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
        res = await fetch(API_BASE_URL + path, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
            body: body && JSON.stringify(body),
        });
    } catch { throw Object.assign(new Error(OFFLINE_MSG), { offline: true }); } // fetch only throws when the network fails
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
    t._h = setTimeout(() => t.className = 'toast', isError ? 8000 : 3500); // errors carry instructions: leave time to read them
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
    stopPush(localStorage.getItem('accessToken')); // a shared phone should stop getting admin notices once its user leaves
    localStorage.removeItem('accessToken');
    try { localStorage.removeItem(STOCK_CACHE); } catch {}
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
    if ((tab === 'usuarios' || tab === 'nuvemshop') && !isAdmin) tab = 'estoque';
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

// Last stock list, kept on the device so the app still shows it without internet (read-only).
const STOCK_CACHE = 'dv-ultimo-estoque';
let offline = false;
function setOffline(on, at) {
    offline = on;
    document.body.classList.toggle('offline', on);
    $('#offlineBar').hidden = !on;
    $('#offlineBar').textContent = on
        ? `Sem internet: mostrando o estoque de ${at ? new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'antes'}. Vender e editar voltam quando a conexão voltar.`
        : '';
}
const needsNet = () => { if (offline) toast('Sem internet: vender e editar ficam bloqueados para não vender uma peça que já saiu.', true); return offline; };
async function load() {
    try {
        pecas = await api('/pecas');
        try { localStorage.setItem(STOCK_CACHE, JSON.stringify({ at: Date.now(), pecas })); } catch { /* full or blocked: the app still works online */ }
        setOffline(false);
    } catch (err) {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STOCK_CACHE)); } catch {}
        if (!err.offline || !saved) throw err;
        pecas = saved.pecas;
        setOffline(true, saved.at);
    }
    for (const p of pecas) {
        p.quantidade = Number(p.quantidade) || 0;
        p.preco_venda = Number(p.preco_venda) || 0;
        p.preco_comprado_unitario = Number(p.preco_comprado_unitario) || 0;
    }
    renderStock();
    renderSales();
    if (isAdmin && !offline) { loadUsers(); loadNuvemshop(); renderPush(); }
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
          <td><div class="peca-cell">${p.fotos?.length ? `<button type="button" class="thumb-btn" data-fotos="${p.id}" aria-label="Ver fotos de ${esc(p.nome)}"><img class="thumb" src="${esc(p.fotos[0].url)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></button>` : ''}<span><strong>${esc(p.nome)}</strong>${p.cor ? `<span class="sub">${esc(uniqJoin(p.cor))}</span>` : ''}</span></div></td>
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
    const t = e.target, fotosBtn = t.closest('[data-fotos]');
    if (fotosBtn) { const p = pecas.find(x => x.id === +fotosBtn.dataset.fotos); openViewer(p.fotos.map(f => f.url), 0, p.nome); return; }
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
    if (needsNet()) return;
    editing = p || null;
    $('#pecaAgain').hidden = !!p;
    $('#pecaTitle').textContent = p ? 'Editar peça' : 'Nova peça';
    for (const [id, key] of Object.entries(pecaFields)) $('#' + id).value = p ? (p[key] ?? '') : '';
    if (!p) $('#fData').value = keepDate || today();
    $('#fFornWrap').hidden = !hasCol('fornecedor');
    $('#gradeRows').innerHTML = '';
    (p ? gradeFromPiece(p) : [undefined]).forEach(r => addGradeRow(r));
    $('#fFotosWrap').hidden = !hasCol('fotos');
    fotoEdit.saved = p?.fotos || []; fotoEdit.remove = new Set(); fotoEdit.add.forEach(f => URL.revokeObjectURL(f.preview)); fotoEdit.add = [];
    renderFotos();
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
    const fotos = { remove: [...fotoEdit.remove], add: fotoEdit.add.map(f => f.file) };
    let aviso = '';
    const saveFotos = async id => {
        for (const path of fotos.remove) await api(`/pecas/${id}/fotos/remover`, { method: 'POST', body: { path } });
        for (const [i, file] of fotos.add.entries()) {
            toast(`Enviando foto ${i + 1} de ${fotos.add.length}…`);
            const r = await uploadFoto(id, file);
            if (r.aviso) aviso = r.aviso;
        }
    };
    if (editing) await run(async () => { await api('/pecas/' + editing.id, { method: 'PUT', body: d }); await saveFotos(editing.id); }, 'Peça atualizada.');
    else {
        await run(async () => { const row = await api('/pecas', { method: 'POST', body: { ...d, status: 'estoque' } }); await saveFotos(row.id); }, `${d.nome} adicionada.`);
        if (action === 'again') openPeca(null, d.data_compra); // same purchase date for the next piece of the batch
    }
    if (aviso) toast(aviso, true); // after the "saved" message, so the warning is the one left on screen
};

// ---------- Fotos ----------
// Changes stay in the dialog until "Salvar"; Cancelar leaves the piece untouched.
const MAX_FOTOS = 8;
const fotoEdit = { saved: [], remove: new Set(), add: [] };
function renderFotos() {
    const kept = fotoEdit.saved.filter(f => !fotoEdit.remove.has(f.path));
    $('#fFotos').innerHTML = [
        ...kept.map((f, i) => `<figure><img src="${esc(f.url)}" alt="" data-ver="${i}"><button type="button" class="btn-link" data-foto-del="${esc(f.path)}" aria-label="Remover foto">Remover</button></figure>`),
        ...fotoEdit.add.map((f, i) => `<figure class="new"><img src="${f.preview}" alt="" data-ver="${kept.length + i}"><button type="button" class="btn-link" data-foto-new="${i}" aria-label="Remover foto nova">Remover</button></figure>`),
    ].join('');
    const total = kept.length + fotoEdit.add.length;
    $('#fFotoInput').disabled = total >= MAX_FOTOS;
    $('#fFotoInput').closest('label').classList.toggle('disabled', total >= MAX_FOTOS);
}
$('#fFotoInput').onchange = e => {
    const room = MAX_FOTOS - (fotoEdit.saved.length - fotoEdit.remove.size) - fotoEdit.add.length;
    const files = [...e.target.files].filter(f => f.type.startsWith('image/'));
    if (files.length > room) $('#pecaMsg').textContent = `Só cabem mais ${room} ${room === 1 ? 'foto' : 'fotos'} nesta peça; as outras ficaram de fora.`;
    for (const file of files.slice(0, room)) fotoEdit.add.push({ file, preview: URL.createObjectURL(file) });
    e.target.value = '';
    renderFotos();
};
$('#fFotos').onclick = e => {
    const { fotoDel, fotoNew, ver } = e.target.dataset;
    if (ver !== undefined) {
        const urls = [...fotoEdit.saved.filter(f => !fotoEdit.remove.has(f.path)).map(f => f.url), ...fotoEdit.add.map(f => f.preview)];
        return openViewer(urls, +ver, $('#fNome').value);
    }
    if (fotoDel) fotoEdit.remove.add(fotoDel);
    if (fotoNew !== undefined) { URL.revokeObjectURL(fotoEdit.add[fotoNew].preview); fotoEdit.add.splice(+fotoNew, 1); }
    renderFotos();
};
// Full-screen viewer: arrows, buttons or a swipe change photo; Esc, ✕ or a tap outside the photo closes.
const viewer = { urls: [], i: 0 };
function showPhoto() {
    const n = viewer.urls.length;
    $('#vImg').src = viewer.urls[viewer.i];
    $('#vCount').textContent = n > 1 ? `${viewer.i + 1} de ${n}` : '';
    $('#vPrev').hidden = $('#vNext').hidden = n < 2;
}
function openViewer(urls, i, nome) {
    if (!urls.length) return;
    Object.assign(viewer, { urls, i });
    $('#vImg').alt = nome ? `Foto de ${nome}` : 'Foto da peça';
    showPhoto();
    $('#viewer').showModal();
}
const stepPhoto = d => { viewer.i = (viewer.i + d + viewer.urls.length) % viewer.urls.length; showPhoto(); };
$('#vPrev').onclick = () => stepPhoto(-1);
$('#vNext').onclick = () => stepPhoto(1);
$('#vClose').onclick = () => $('#viewer').close();
$('#viewer').onclick = e => { if (e.target.id === 'viewer') $('#viewer').close(); }; // tap on the dark area around the photo
$('#viewer').onkeydown = e => { if (e.key === 'ArrowLeft') stepPhoto(-1); if (e.key === 'ArrowRight') stepPhoto(1); };
let swipeX = null;
$('#viewer').addEventListener('touchstart', e => { swipeX = e.touches[0].clientX; }, { passive: true });
$('#viewer').addEventListener('touchend', e => {
    if (swipeX === null || viewer.urls.length < 2) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    if (Math.abs(dx) > 50) stepPhoto(dx < 0 ? 1 : -1);
    swipeX = null;
});

// Shrinks the photo before sending (phone photos are several MB; Vercel accepts at most 4.5 MB per request).
// The server turns whatever arrives into WebP, so the browser only needs to make it small.
async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = url;
        await img.decode(); // <img> applies the phone's rotation (EXIF) in every current browser
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.85));
        // Safari can't make WebP and silently returns a large PNG instead: send a JPEG then.
        if (blob && blob.type === 'image/webp') return blob;
        return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85)) || file;
    } catch {
        return file; // a format the browser can't open (e.g. HEIC on a computer): let the server try
    } finally { URL.revokeObjectURL(url); }
}
async function uploadFoto(id, file) {
    const blob = await shrink(file);
    const res = await fetch(`${API_BASE_URL}/pecas/${id}/fotos`, {
        method: 'POST', body: blob,
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': blob.type || 'image/jpeg' },
    });
    if (res.status === 401) { logout(); throw new Error('Sua sessão expirou. Entre de novo.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || (res.status === 413 ? 'Foto grande demais.' : `Erro ${res.status} ao enviar a foto.`));
    return data;
}

// Vender
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
    if (needsNet()) return;
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
    if (needsNet()) return;
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
          <td class="num" data-l="Desconto">${+p.desconto ? `${+(+p.desconto).toFixed(1)}%` : '–'}</td>
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

const PAY = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro', nuvemshop: 'Nuvemshop' };
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

// ---------- Nuvemshop ----------
const NS_STATUS = { processado: 'Venda registrada e baixa no estoque', pendente: 'Com pendência', cancelado: 'Cancelado e devolvido ao estoque',
    resolvido: 'Resolvido à mão', erro: 'Erro', processando: 'Processando' };
async function loadNuvemshop() {
    let st;
    try { st = await api('/nuvemshop/status'); } catch (err) { $('#nsStatus').textContent = err.message; return; }
    const box = $('#nsStatus');
    if (!st.configured) box.innerHTML = '<p>Falta configurar: adicione <strong>NUVEMSHOP_TOKEN</strong> e <strong>NUVEMSHOP_STORE_ID</strong> nas variáveis da Vercel e faça Redeploy.</p>';
    else if (st.apiError) box.innerHTML = `<p><strong>A Nuvemshop recusou o acesso.</strong> Confira se o token e o ID da loja estão certos e se o aplicativo tem permissão de leitura de pedidos. Resposta: ${esc(st.apiError)}</p>`;
    else if (st.needsMigration) box.innerHTML = '<p>Falta criar a tabela da integração: rode o SQL da Nuvemshop no Supabase (SQL Editor) e recarregue esta página.</p>';
    else if (!st.webhooksOk) box.innerHTML = `<p><strong>Loja ${esc(st.storeName || st.storeId)} encontrada.</strong> Falta ativar os avisos para que os pedidos pagos entrem aqui sozinhos.</p><button class="btn btn-primary" id="nsSetup">Ativar avisos de pedidos</button>`;
    else box.innerHTML = `<p><strong>Conectada à loja ${esc(st.storeName || st.storeId)}.</strong> Pedidos pagos entram sozinhos como vendas; pedidos cancelados voltam ao estoque.</p>`;
    const prod = st.produtos;
    $('#nsProdBox').hidden = !st.configured || !!st.apiError || st.needsMigration || !prod;
    if (prod) {
        $('#nsProdText').textContent = prod.enviados
            ? `${prod.enviados} ${prod.enviados === 1 ? 'produto ligado' : 'produtos ligados'} à loja. Peças novas, vendas e edições daqui atualizam o estoque de lá sozinhas. Produtos novos entram ocultos: publique na Nuvemshop depois de pôr fotos e descrição.`
            : 'Nenhuma peça enviada ainda. Envie o estoque atual uma vez; depois, cada peça nova vai sozinha, oculta para você revisar antes de publicar.';
        $('#nsProdErr').innerHTML = prod.erros.map(e => `<li class="pending">
            <span><strong>${esc(e.nome)}</strong><span class="sub">${esc(e.erro)}</span></span>
            <span class="row-actions"><button class="btn-link" data-ns-sync="${esc(e.nome)}">Sincronizar de novo</button></span></li>`).join('');
    }
    const pend = st.pedidos.filter(p => p.status === 'erro' || (p.itens_pendentes || []).length);
    $('#nsBadge').hidden = !pend.length;
    $('#nsBadge').textContent = pend.length;
    const head = p => `Pedido #${esc(p.numero || p.pedido_id)}${p.data_venda ? `, ${fmtDate(p.data_venda)}` : ''}${p.cliente ? `, ${esc(p.cliente)}` : ''}`;
    $('#nsPend').innerHTML = pend.map(p => `<li class="pending">
        <span><strong>${head(p)}</strong>
          ${p.status === 'erro' ? `<span class="sub">Não foi processado: ${esc(p.erro)}. Confira o estoque e registre a venda à mão se precisar.</span>` : ''}
          ${(p.itens_pendentes || []).map(i => `<span class="sub">${esc(i.nome)}: ${i.quantidade} ${i.quantidade === 1 ? 'unidade não encontrada' : 'unidades não encontradas'} no estoque (${money(i.preco)} cada). Registre a venda à mão.</span>`).join('')}
        </span>
        <span class="row-actions"><button class="btn-link" data-ns-ok="${esc(p.pedido_id)}">Marcar como resolvido</button></span></li>`).join('');
    $('#nsPendEmpty').hidden = pend.length > 0 || !st.webhooksOk;
    const recent = st.pedidos.slice(0, 15);
    $('#nsRecent').innerHTML = recent.map(p => {
        const label = p.status === 'processado' && (p.itens_pendentes || []).length ? NS_STATUS.pendente : NS_STATUS[p.status] || esc(p.status);
        return `<li><span><strong>${head(p)}</strong><span class="sub">${label}</span></span></li>`;
    }).join('');
    $('#nsRecentEmpty').hidden = recent.length > 0 || !st.webhooksOk;
}
$('#nsStatus').onclick = async e => {
    if (e.target.id !== 'nsSetup') return;
    e.target.disabled = true;
    try { toast((await api('/nuvemshop/setup', { method: 'POST' })).message); await loadNuvemshop(); }
    catch (err) { toast(err.message, true); e.target.disabled = false; }
};
$('#nsSyncAll').onclick = async () => {
    const btn = $('#nsSyncAll');
    if (!await confirmAction('Enviar estoque', 'Cada nome de peça vira um produto oculto na Nuvemshop, com as cores e tamanhos como variações e o estoque daqui. Produtos com o mesmo nome que já existem lá são atualizados, não duplicados. Continuar?', 'Enviar')) return;
    btn.disabled = true;
    try {
        let next = 0;
        while (next !== null) {
            const r = await api('/nuvemshop/sync-all', { method: 'POST', body: { offset: next } });
            btn.textContent = `Enviando ${r.done} de ${r.total}…`;
            next = r.next;
            if (next !== null) await new Promise(ok => setTimeout(ok, 1500)); // stay under Nuvemshop's rate limit
        }
        toast('Estoque enviado para a Nuvemshop.');
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = 'Enviar todo o estoque para a Nuvemshop'; await loadNuvemshop(); }
};
$('#nsProdErr').onclick = async e => {
    const nome = e.target.dataset.nsSync;
    if (!nome) return;
    e.target.disabled = true;
    try { const r = await api('/nuvemshop/produtos/sync', { method: 'POST', body: { nome } }); toast(r.message, !r.ok); }
    catch (err) { toast(err.message, true); }
    await loadNuvemshop();
};
$('#nsPend').onclick = async e => {
    const id = e.target.dataset.nsOk;
    if (!id) return;
    try { await api(`/nuvemshop/pedidos/${encodeURIComponent(id)}/resolver`, { method: 'POST' }); toast('Pedido marcado como resolvido.'); await loadNuvemshop(); }
    catch (err) { toast(err.message, true); }
};
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
        $('#tabUsuarios').hidden = $('#tabNuvem').hidden = !isAdmin;
        oldMonths = await api('/historico').catch(() => []);
        showTab();
        await load();
    } catch (e) { toast(e.message, true); }
}
// ---------- App instalável ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(err => console.warn('service worker', err));
addEventListener('online', () => { if (localStorage.getItem('accessToken')) load().catch(() => {}); });
addEventListener('offline', () => {
    if ($('#appView').hidden) return;
    let at;
    try { at = JSON.parse(localStorage.getItem(STOCK_CACHE) || '{}').at; } catch { /* storage blocked */ }
    setOffline(true, at);
});
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Android/Chrome: the browser offers its own install prompt; we keep it for the "Instalar app" button.
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('#installBtn').hidden = false; });
addEventListener('appinstalled', () => { installPrompt = null; $('#installBtn').hidden = true; });
$('#installBtn').onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null; $('#installBtn').hidden = true;
};
// iPhone: no install prompt exists, so show the two taps once (until dismissed).
let tipSeen = false;
try { tipSeen = localStorage.getItem('dv-dica-ios') === '1'; } catch {}
$('#iosTip').hidden = !(isIOS && !standalone() && !tipSeen);
$('#iosTipOk').onclick = () => { $('#iosTip').hidden = true; try { localStorage.setItem('dv-dica-ios', '1'); } catch {} };

// ---------- Notificações (admins) ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = b64 => { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function currentSub() { return pushSupported() ? (await navigator.serviceWorker.ready).pushManager.getSubscription() : null; }
async function renderPush() {
    const text = $('#pushText'), btn = $('#pushBtn');
    btn.hidden = true;
    if (!pushSupported()) {
        text.textContent = isIOS && !standalone()
            ? 'No iPhone, as notificações só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais novo). Instale e abra por ele.'
            : 'Este navegador não recebe notificações.';
        return;
    }
    if (Notification.permission === 'denied') { text.textContent = 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador ou do celular.'; return; }
    const sub = await currentSub().catch(() => null);
    text.textContent = sub ? 'Este aparelho recebe avisos de pedidos de acesso e de pendências da Nuvemshop.'
        : 'Receba um aviso quando alguém pedir acesso ou um pedido da Nuvemshop ficar com pendência.';
    btn.textContent = sub ? 'Desativar notificações' : 'Ativar notificações';
    btn.hidden = false;
}
$('#pushBtn').onclick = async () => {
    const btn = $('#pushBtn');
    btn.disabled = true;
    try {
        const sub = await currentSub();
        if (sub) {
            await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
            await sub.unsubscribe();
            toast('Notificações desativadas neste aparelho.');
        } else {
            if (await Notification.requestPermission() !== 'granted') throw new Error('Sem permissão, o aparelho não pode receber avisos.');
            const { publicKey } = await api('/push/key');
            const reg = await navigator.serviceWorker.ready;
            const created = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
            await api('/push/subscribe', { method: 'POST', body: { subscription: created.toJSON() } });
            toast('Notificações ativadas neste aparelho.');
        }
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; renderPush(); }
};
// Runs during logout, so it uses the token captured before it was removed and plain fetch:
// api() would treat the answer to a missing token as "session expired" and log out again, in a loop.
async function stopPush(token) {
    try {
        const sub = await currentSub();
        if (!sub) return;
        if (token) await fetch(API_BASE_URL + '/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }).catch(() => {});
        await sub.unsubscribe();
    } catch { /* best effort */ }
}

localStorage.getItem('accessToken') && !resetToken ? start() : showAuth(); // a reset link always opens the new-password screen
