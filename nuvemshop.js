// Nuvemshop → site: a paid online order becomes a sale here and leaves the stock; a cancelled one goes back.
// Pieces are matched by name + color + size. Anything that doesn't match is kept as a pending item for the admin.
// Uses a store "aplicativo sob medida": NUVEMSHOP_TOKEN and NUVEMSHOP_STORE_ID come from the Vercel variables.
const crypto = require('crypto');
const { stockUnits, available, afterSale } = require('./public/js/variants.js');

const API = 'https://api.nuvemshop.com.br/2025-03';
const UA = 'Doce Veneno Estoque (lucasoliprogramador@gmail.com)';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const spDate = iso => new Date(iso || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
// Order items are named "Calça Cargo (Preta, GG)" when they have variants; the piece here is just "Calça Cargo".
const baseName = item => (item.variant_values || []).length ? String(item.name).replace(/\s*\([^()]*\)\s*$/, '') : String(item.name);

// The color/size combinations of a piece that fit an order item's variant values.
function matchingCombos(p, stock, values) {
    const vals = new Set(values.map(norm));
    const combos = stock.paired
        ? [...new Map(stock.units.map(u => [u.cor + '|' + u.tam, u])).values()]
        : (stock.c.length ? [...new Set(stock.c)] : ['']).flatMap(cor => (stock.t.length ? [...new Set(stock.t)] : ['']).map(tam => ({ cor, tam })));
    const inStock = combos.filter(c => available(stock, c.cor, c.tam, p.quantidade) > 0);
    if (!vals.size) return inStock.length === 1 ? inStock : []; // no variant info: only safe when there is one option
    // Exact: the piece's color and size are both among the order's values.
    const exact = inStock.filter(c => (!c.cor || vals.has(norm(c.cor))) && (!c.tam || vals.has(norm(c.tam))));
    if (exact.length) return exact;
    // Partial: every order value is the piece's color or size (e.g. order says only "Preta", piece is "Preta, U").
    // Accepted only when it points to a single option; otherwise it's ambiguous and becomes a pending item.
    const partial = inStock.filter(c => [...vals].every(v => v === norm(c.cor) || v === norm(c.tam)));
    return partial.length === 1 ? partial : [];
}

module.exports = function nuvemshop(app, { supabase, check, route, auth, adminOnly, jwtSecret, APP_URL }) {
    const cfg = process.env.NUVEMSHOP_TOKEN && process.env.NUVEMSHOP_STORE_ID
        ? { store_id: String(process.env.NUVEMSHOP_STORE_ID).trim(), access_token: String(process.env.NUVEMSHOP_TOKEN).trim() } : null;
    // Webhooks are authenticated by a secret key in their URL (derived from JWT_SECRET), and every event is
    // re-checked against the Nuvemshop API before touching stock, so a forged call can't invent a sale.
    const hookKey = crypto.createHmac('sha256', String(jwtSecret)).update('nuvemshop-webhook').digest('hex').slice(0, 32);
    const hookUrl = `${APP_URL}/api/nuvemshop/webhook?key=${hookKey}`;
    const EVENTS = ['order/paid', 'order/cancelled'];
    async function ns(path, { method = 'GET', body } = {}) {
        const res = await fetch(`${API}/${cfg.store_id}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${cfg.access_token}`, Authentication: `bearer ${cfg.access_token}`, // current and legacy header names
                'User-Agent': UA, 'Content-Type': 'application/json',
            },
            body: body && JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(`Nuvemshop ${res.status}: ${data.description || data.message || res.statusText}`), { status: res.status });
        return data;
    }

    // Writes the sale of q units of one color/size of piece p (same rules as the sale dialog).
    async function sell(p, stock, cor, tam, q, item, order) {
        const price = Number(item.price) || 0, list = Number(p.preco_venda) || 0;
        const sale = {
            status: 'vendida', data_venda: spDate(order.paid_at), preco_venda: price, quantidade: q,
            desconto: list > 0 ? +((1 - price / list) * 100).toFixed(4) : 0, // 4 decimals so "Desfazer venda" restores the exact list price
            lucro: +((price - (Number(p.preco_comprado_unitario) || 0)) * q).toFixed(2),
            cor: cor || null, tamanho: tam || null, forma_pagamento: 'nuvemshop',
            cliente_nome: order.customer?.name || order.contact_name || null,
            cliente_telefone: order.customer?.phone || order.contact_phone || null,
            fornecedor: p.fornecedor ?? null, pedido_nuvemshop: String(order.id),
        };
        if (q === p.quantidade) {
            check(await supabase.from('pecas').update(sale).eq('id', p.id));
            p.quantidade = 0;
            return;
        }
        // Sold row first, so a failure never loses stock.
        check(await supabase.from('pecas').insert([{ nome: p.nome, data_compra: p.data_compra, preco_comprado_unitario: p.preco_comprado_unitario, ...sale }]));
        const rest = afterSale(stock, cor, tam, q);
        check(await supabase.from('pecas').update({ quantidade: p.quantidade - q, ...rest }).eq('id', p.id));
        Object.assign(p, { quantidade: p.quantidade - q, ...rest }); // later items of the same order see the new stock
    }

    async function processPaid(orderId) {
        // Claim the order first: Nuvemshop may deliver the same webhook twice, and a sale must never be written twice.
        const claim = await supabase.from('nuvemshop_pedidos').insert([{ pedido_id: String(orderId), status: 'processando' }]);
        if (claim.error) { if (claim.error.code === '23505') return 'duplicado'; throw claim.error; }
        const release = () => supabase.from('nuvemshop_pedidos').delete().eq('pedido_id', String(orderId));
        let order;
        try { order = await ns(`/orders/${orderId}`); }
        catch (err) { await release(); throw err; } // nothing written yet: let Nuvemshop's retry try again
        if (order.payment_status !== 'paid') { await release(); return 'nao-pago'; }
        try {
            const stockRows = check(await supabase.from('pecas').select('*')).filter(p => p.status !== 'vendida' && Number(p.quantidade) > 0)
                .map(p => ({ ...p, quantidade: Number(p.quantidade), preco_venda: Number(p.preco_venda) }))
                .sort((a, b) => String(a.data_compra || '9999').localeCompare(String(b.data_compra || '9999'))); // oldest stock leaves first
            const pendentes = [];
            for (const item of order.products || []) {
                let remaining = Number(item.quantity) || 0;
                for (const p of stockRows.filter(p => p.quantidade > 0 && norm(p.nome) === norm(baseName(item)))) {
                    if (!remaining) break;
                    const stock = stockUnits(p);
                    const combo = matchingCombos(p, stock, item.variant_values || [])[0];
                    if (!combo) continue;
                    const q = Math.min(remaining, available(stock, combo.cor, combo.tam, p.quantidade));
                    await sell(p, stock, combo.cor, combo.tam, q, item, order);
                    remaining -= q;
                }
                if (remaining) pendentes.push({ nome: String(item.name), variante: (item.variant_values || []).join(', '), quantidade: remaining, preco: Number(item.price) || 0 });
            }
            check(await supabase.from('nuvemshop_pedidos').update({
                status: 'processado', numero: String(order.number ?? ''), data_venda: spDate(order.paid_at),
                cliente: order.customer?.name || order.contact_name || null, itens_pendentes: pendentes,
            }).eq('pedido_id', String(orderId)));
            return pendentes.length ? 'pendente' : 'ok';
        } catch (err) {
            // Keep the claim (a retry could double-sell what already went through); the admin sees the error.
            await supabase.from('nuvemshop_pedidos').update({ status: 'erro', erro: String(err.message).slice(0, 500) }).eq('pedido_id', String(orderId));
            throw err;
        }
    }

    async function processCancelled(orderId) {
        const ped = check(await supabase.from('nuvemshop_pedidos').select('*').eq('pedido_id', String(orderId)).maybeSingle());
        if (!ped || ped.status === 'cancelado') return 'ignorado';
        const order = await ns(`/orders/${orderId}`);
        if (order.status !== 'cancelled') return 'nao-cancelado';
        const rows = check(await supabase.from('pecas').select('*').eq('pedido_nuvemshop', String(orderId)))
            .filter(r => r.status === 'vendida');
        for (const r of rows) {
            const d = Number(r.desconto) || 0, price = Number(r.preco_venda) || 0;
            check(await supabase.from('pecas').update({
                status: 'estoque', data_venda: null, desconto: null, lucro: null,
                preco_venda: d && d < 100 ? +(price / (1 - d / 100)).toFixed(2) : price,
                forma_pagamento: null, cliente_nome: null, cliente_telefone: null, pedido_nuvemshop: null,
            }).eq('id', r.id));
        }
        check(await supabase.from('nuvemshop_pedidos').update({ status: 'cancelado', itens_pendentes: [] }).eq('pedido_id', String(orderId)));
        return 'cancelado';
    }

    // --- Webhook (called by Nuvemshop) ---
    app.post('/api/nuvemshop/webhook', route(async (req, res) => {
        const key = String(req.query.key || '');
        if (!cfg || key.length !== hookKey.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(hookKey))) return res.sendStatus(401);
        const { event, id, store_id } = req.body;
        if (String(store_id) !== cfg.store_id) return res.sendStatus(200); // not our store: acknowledge and ignore
        const result = event === 'order/paid' ? await processPaid(id)
            : event === 'order/cancelled' ? await processCancelled(id) : 'ignorado';
        res.json({ result });
    }));

    // --- Admin ---
    // Registers the two order webhooks (skips the ones already there). Safe to run again.
    app.post('/api/nuvemshop/setup', auth, adminOnly, route(async (req, res) => {
        if (!cfg) return res.status(503).json({ message: 'Configure NUVEMSHOP_TOKEN e NUVEMSHOP_STORE_ID na Vercel.' });
        const existing = await ns('/webhooks');
        for (const event of EVENTS) {
            if (!existing.some(w => w.event === event && w.url === hookUrl)) await ns('/webhooks', { method: 'POST', body: { event, url: hookUrl } });
        }
        res.json({ message: 'Avisos de pedidos ativados.' });
    }));

    app.get('/api/nuvemshop/status', auth, adminOnly, route(async (req, res) => {
        const out = { configured: !!cfg, storeId: cfg?.store_id || null, storeName: null, webhooksOk: false, apiError: null, needsMigration: false, pedidos: [] };
        try {
            out.pedidos = check(await supabase.from('nuvemshop_pedidos').select('*').order('created_at', { ascending: false }).limit(100));
        } catch (err) {
            if (/nuvemshop_pedidos/.test(err.message) || err.code === '42P01' || err.code === 'PGRST205') out.needsMigration = true;
            else throw err;
        }
        if (cfg) {
            try {
                const [store, hooks] = await Promise.all([ns('/store'), ns('/webhooks')]);
                const n = store.name; out.storeName = typeof n === 'object' ? n.pt || Object.values(n)[0] : n;
                out.webhooksOk = EVENTS.every(e => hooks.some(w => w.event === e && w.url === hookUrl));
            } catch (err) { out.apiError = err.message; }
        }
        res.json(out);
    }));

    app.post('/api/nuvemshop/pedidos/:id/resolver', auth, adminOnly, route(async (req, res) => {
        check(await supabase.from('nuvemshop_pedidos').update({ status: 'resolvido', itens_pendentes: [], erro: null }).eq('pedido_id', req.params.id));
        res.json({ message: 'Pedido marcado como resolvido.' });
    }));
};
module.exports.matchingCombos = matchingCombos;
module.exports.baseName = baseName;
