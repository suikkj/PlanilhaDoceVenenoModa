// Nuvemshop → site: a paid online order becomes a sale here and leaves the stock; a cancelled one goes back.
// Pieces are matched by name + color + size. Anything that doesn't match is kept as a pending item for the admin.
// Uses a store "aplicativo sob medida": NUVEMSHOP_TOKEN and NUVEMSHOP_STORE_ID come from the Vercel variables.
const crypto = require('crypto');
const { stockUnits, available, afterSale, splitList } = require('./public/js/variants.js');

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

module.exports = function nuvemshop(app, { supabase, check, route, auth, adminOnly, jwtSecret, APP_URL, notifyAdmins = async () => {} }) {
    const cfg = process.env.NUVEMSHOP_TOKEN && process.env.NUVEMSHOP_STORE_ID
        ? { store_id: String(process.env.NUVEMSHOP_STORE_ID).trim(), access_token: String(process.env.NUVEMSHOP_TOKEN).trim() } : null;
    // Webhooks are authenticated by a secret key in their URL (derived from JWT_SECRET), and every event is
    // re-checked against the Nuvemshop API before touching stock, so a forged call can't invent a sale.
    const hookKey = crypto.createHmac('sha256', String(jwtSecret)).update('nuvemshop-webhook').digest('hex').slice(0, 32);
    const hookUrl = `${APP_URL}/api/nuvemshop/webhook?key=${hookKey}`;
    const EVENTS = ['order/paid', 'order/cancelled'];
    async function ns(path, { method = 'GET', body } = {}, retried) {
        const res = await fetch(`${API}/${cfg.store_id}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${cfg.access_token}`, Authentication: `bearer ${cfg.access_token}`, // current and legacy header names
                'User-Agent': UA, 'Content-Type': 'application/json',
            },
            body: body && JSON.stringify(body),
        });
        if (res.status === 429 && !retried) { await new Promise(r => setTimeout(r, 1500)); return ns(path, { method, body }, true); } // rate limit: wait and retry once
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

    // Description sent to the store: the piece's text, plus its measurements when filled in.
    const escHtml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    function descOf(named) {
        const d = named.find(p => p.descricao)?.descricao, m = named.find(p => p.medidas)?.medidas;
        if (!m) return d; // unchanged for pieces without measurements, so existing descriptions are not re-sent
        return [d, `Medidas da peça: ${m}`].filter(Boolean).map(t => `<p>${escHtml(t)}</p>`).join('');
    }
    // New products go into the category the first word of the name points to (categories created in the store).
    const CAT_BY_WORD = { vestido: 'Vestidos', conjunto: 'Conjuntos', 'conj.': 'Conjuntos', trijunto: 'Conjuntos', blusa: 'Blusas e Regatas',
        regata: 'Blusas e Regatas', camisa: 'Blusas e Regatas', 't-shirt': 'Blusas e Regatas', poncho: 'Blusas e Regatas', blazer: 'Blusas e Regatas',
        body: 'Bodies e Croppeds', cropped: 'Bodies e Croppeds', top: 'Bodies e Croppeds', 'calça': 'Calças', legging: 'Calças',
        saia: 'Saias e Shorts', short: 'Saias e Shorts', 'cinta/short': 'Saias e Shorts', 'macacão': 'Macacões', macaquinho: 'Macacões',
        cinto: 'Cintos', cintos: 'Cintos', meia: 'Meias-calças' };
    let catCache = null;
    async function categoryFor(nome) {
        const want = CAT_BY_WORD[String(nome).trim().split(/\s+/)[0].toLowerCase()];
        if (!want) return {};
        try {
            catCache ||= await ns('/categories?per_page=200');
            const c = catCache.find(c => norm(valOf(c.name)) === norm(want));
            return c ? { categories: [c.id] } : {};
        } catch { return {}; } // no category is better than a failed product
    }

    // ===================== Site → Nuvemshop: products and stock =====================
    // One Nuvemshop product per piece name (rows with the same name are merged); one variant per color+size.
    // The site is the source of truth: every change here sets the product's variant stock to what is in stock here.
    const FILL = { cor: 'Única', tam: 'Único' }; // value used when a product has the attribute but the unit has none
    const valOf = v => (v && typeof v === 'object' ? v.pt ?? Object.values(v)[0] : v) ?? '';
    // One entry per unit, read the same way as the edit grade (a single value applies to every unit).
    function unitsOf(p) {
        const c = splitList(p.cor), t = splitList(p.tamanho), n = Number(p.quantidade) || 0;
        const at = (l, i) => l.length === 1 ? l[0] : (l[i] || '');
        return Array.from({ length: n }, (_, i) => ({ cor: at(c, i), tam: at(t, i) }));
    }
    const comboKey = (cor, tam) => `${norm(cor)}|${norm(tam)}`;
    const money2 = v => (Number(v) || 0).toFixed(2);

    // Adds photos the product doesn't have yet and removes the ones deleted here. Only touches photos the site sent,
    // so pictures added directly on Nuvemshop stay.
    async function syncImages(key, productId, fotos) {
        const r = await supabase.from('nuvemshop_produtos').select('fotos_enviadas').eq('nome', key).maybeSingle();
        if (r.error) { if (r.error.code === '42703' || /fotos_enviadas/.test(r.error.message)) return; throw r.error; } // photo migration not run yet
        let sent = r.data?.fotos_enviadas || [];
        const save = async () => check(await supabase.from('nuvemshop_produtos').update({ fotos_enviadas: sent }).eq('nome', key));
        const keep = new Set(fotos.map(f => f.path));
        for (const old of sent.filter(x => !keep.has(x.path))) {
            await ns(`/products/${productId}/images/${old.id}`, { method: 'DELETE' }).catch(err => { if (err.status !== 404) throw err; });
            sent = sent.filter(x => x !== old); await save();
        }
        for (const f of fotos) {
            if (sent.some(x => x.path === f.path)) continue;
            const img = await ns(`/products/${productId}/images`, { method: 'POST', body: { src: f.url } }); // Nuvemshop downloads it from the public link
            sent = [...sent, { path: f.path, id: img.id }]; await save(); // saved one by one: a failure halfway never re-sends the same photo
        }
    }

    async function syncName(nome) {
        const key = norm(nome);
        const named = check(await supabase.from('pecas').select('*')).filter(p => norm(p.nome) === key);
        const rows = named.filter(p => p.status !== 'vendida' && Number(p.quantidade) > 0);
        // Photos of every row with this name, sold ones included, so a product keeps its photos while restocking.
        const desc = descOf(named);
        const pronto = fotos => fotos.length > 0 && named.some(p => String(p.descricao || '').trim()); // photo + description in the sheet
        const fotos = [...new Map(named.flatMap(p => p.fotos || []).map(f => [f.path, f])).values()];
        const want = new Map();
        for (const p of rows) for (const u of unitsOf(p)) {
            const k = comboKey(u.cor, u.tam);
            const w = want.get(k) || { cor: u.cor, tam: u.tam, stock: 0, price: 0, cost: 0 };
            w.stock++; w.price = Math.max(w.price, Number(p.preco_venda) || 0); w.cost = Math.max(w.cost, Number(p.preco_comprado_unitario) || 0);
            want.set(k, w);
        }
        let map = check(await supabase.from('nuvemshop_produtos').select('*').eq('nome', key).maybeSingle());
        let productId = map?.product_id;
        if (!productId) {
            if (!want.size) { if (map) check(await supabase.from('nuvemshop_produtos').update({ erro: null }).eq('nome', key)); return 'sem-estoque'; }
            // Reuse a product that already exists on the store with the same name instead of duplicating it.
            const found = (await ns(`/products?q=${encodeURIComponent(rows[0].nome)}&per_page=50`)).find(pr => norm(valOf(pr.name)) === key);
            if (found) productId = String(found.id);
            else {
                if (!map) { // claim the name so two simultaneous changes don't create two products
                    const c = await supabase.from('nuvemshop_produtos').insert([{ nome: key }]);
                    if (c.error) { if (c.error.code === '23505') return 'em-andamento'; throw c.error; }
                }
                const attrs = [...([...want.values()].some(v => v.cor) ? ['Cor'] : []), ...([...want.values()].some(v => v.tam) ? ['Tamanho'] : [])];
                const created = await ns('/products', { method: 'POST', body: {
                    name: { pt: rows[0].nome }, ...(desc && { description: { pt: desc } }), ...(await categoryFor(rows[0].nome)), published: false, attributes: attrs.map(a => ({ pt: a })),
                    variants: [...want.values()].map(v => ({
                        price: money2(v.price), stock: v.stock, ...(v.cost > 0 && { cost: money2(v.cost) }),
                        ...(attrs.length && { values: attrs.map(a => ({ pt: a === 'Cor' ? v.cor || FILL.cor : v.tam || FILL.tam })) }),
                    })),
                } });
                check(await supabase.from('nuvemshop_produtos').update({ product_id: String(created.id), erro: null, updated_at: new Date().toISOString() }).eq('nome', key));
                await syncImages(key, String(created.id), fotos);
                if (pronto(fotos)) await ns(`/products/${created.id}`, { method: 'PUT', body: { published: true } }); // photo + description: goes live
                return 'criado';
            }
            check(await supabase.from('nuvemshop_produtos').upsert([{ nome: key, product_id: productId, erro: null, updated_at: new Date().toISOString() }]));
        }
        const product = await ns(`/products/${productId}`);
        if (desc && valOf(product.description) !== desc) await ns(`/products/${productId}`, { method: 'PUT', body: { description: { pt: desc } } });
        const names = (product.attributes || []).map(a => norm(valOf(a)));
        let iCor = names.findIndex(a => /^(cor|color|colour)/.test(a)), iTam = names.findIndex(a => /^(tam|size|talla|talle)/.test(a));
        if (iCor < 0 && iTam < 0 && names.length) { iCor = 0; iTam = names.length > 1 ? 1 : -1; } // unknown names: assume color, size
        const unfill = (v, f) => norm(v) === norm(f) ? '' : v;
        const keyOfVariant = v => {
            const vals = (v.values || []).map(valOf);
            return comboKey(iCor >= 0 ? unfill(vals[iCor], FILL.cor) : '', iTam >= 0 ? unfill(vals[iTam], FILL.tam) : '');
        };
        const updates = [], problems = [], seen = new Set();
        for (const v of product.variants || []) {
            const k = keyOfVariant(v), w = want.get(k);
            seen.add(k);
            // Sold-out combinations keep their variant (and photos) with stock 0.
            updates.push({ id: v.id, stock: w ? w.stock : 0, ...(w && { price: money2(w.price) }) });
        }
        for (const [k, w] of want) {
            if (seen.has(k)) continue;
            if ((w.cor && iCor < 0) || (w.tam && iTam < 0) || !names.length) {
                problems.push(`${[w.cor, w.tam].filter(Boolean).join(' ') || 'sem variação'}: o produto na Nuvemshop não tem ${w.cor && iCor < 0 ? 'a opção Cor' : w.tam && iTam < 0 ? 'a opção Tamanho' : 'variações'}`);
                continue;
            }
            const values = names.map((_, i) => ({ pt: i === iCor ? w.cor || FILL.cor : i === iTam ? w.tam || FILL.tam : '-' }));
            const nv = await ns(`/products/${productId}/variants`, { method: 'POST', body: { values, price: money2(w.price), ...(w.cost > 0 && { cost: money2(w.cost) }) } });
            updates.push({ id: nv.id, stock: w.stock });
        }
        if (updates.length) await ns(`/products/${productId}/variants`, { method: 'PATCH', body: updates });
        await syncImages(key, productId, fotos);
        // Hidden product that now has a photo and a description here: goes live. Never hides one that is visible.
        if (!product.published && pronto(fotos)) await ns(`/products/${productId}`, { method: 'PUT', body: { published: true } });
        const erro = problems.length ? `Ajuste à mão na Nuvemshop: ${problems.join('; ')}.` : null;
        check(await supabase.from('nuvemshop_produtos').update({ erro, updated_at: new Date().toISOString() }).eq('nome', key));
        return erro ? 'parcial' : 'atualizado';
    }

    // Called after any stock change here. Never throws: a Nuvemshop failure must not block a sale in the shop.
    async function afterChange(names) {
        if (!cfg) return;
        for (const nome of [...new Set(names.filter(Boolean).map(String))]) {
            try {
                await syncName(nome);
                await supabase.from('nuvemshop_fila').delete().eq('nome', nome); // done: the scheduled run can skip it
            }
            catch (err) {
                if (err.code === 'PGRST205' || err.code === '42P01') return; // integration tables not created yet
                // update keeps the product link; insert only when the name has no row yet
                const erro = `Não sincronizou: ${String(err.message).slice(0, 300)}`, updated_at = new Date().toISOString();
                const upd = await supabase.from('nuvemshop_produtos').update({ erro, updated_at }).eq('nome', norm(nome)).select('nome');
                if (!upd.error && !upd.data?.length) await supabase.from('nuvemshop_produtos').insert([{ nome: norm(nome), erro, updated_at }]);
            }
        }
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
            await afterChange(order.products.map(baseName)); // Nuvemshop stock = stock here, also after concurrent shop sales
            if (pendentes.length) await notifyAdmins('Pedido da Nuvemshop com pendência',
                `Pedido #${order.number}: ${pendentes.length} ${pendentes.length === 1 ? 'item não encontrado' : 'itens não encontrados'} no estoque. Registre a venda à mão.`, '/#nuvemshop');
            return pendentes.length ? 'pendente' : 'ok';
        } catch (err) {
            // Keep the claim (a retry could double-sell what already went through); the admin sees the error.
            await supabase.from('nuvemshop_pedidos').update({ status: 'erro', erro: String(err.message).slice(0, 500) }).eq('pedido_id', String(orderId));
            await notifyAdmins('Pedido da Nuvemshop não processado', `Pedido ${order.number ?? orderId}: confira o estoque na aba Nuvemshop.`, '/#nuvemshop');
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
        await afterChange(rows.map(r => r.nome));
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
        try {
            const prods = check(await supabase.from('nuvemshop_produtos').select('*'));
            const display = new Map(check(await supabase.from('pecas').select('nome')).map(p => [norm(p.nome), p.nome])); // rows are keyed by the normalized name
            out.produtos = { enviados: prods.filter(p => p.product_id).length, erros: prods.filter(p => p.erro).map(p => ({ nome: display.get(p.nome) || p.nome, erro: p.erro })) };
        } catch { out.produtos = null; }
        res.json(out);
    }));

    // Sends the whole stock in small batches; the page calls it repeatedly with the returned offset.
    app.post('/api/nuvemshop/sync-all', auth, adminOnly, route(async (req, res) => {
        if (!cfg) return res.status(503).json({ message: 'Configure NUVEMSHOP_TOKEN e NUVEMSHOP_STORE_ID na Vercel.' });
        const offset = Math.max(0, parseInt(req.body.offset, 10) || 0);
        const pecas = check(await supabase.from('pecas').select('nome, status, quantidade'));
        const mapped = check(await supabase.from('nuvemshop_produtos').select('nome'));
        const byKey = new Map();
        for (const p of pecas) if (p.status !== 'vendida' && Number(p.quantidade) > 0 && !byKey.has(norm(p.nome))) byKey.set(norm(p.nome), p.nome);
        for (const m of mapped) if (!byKey.has(m.nome)) byKey.set(m.nome, m.nome); // sold-out products go to stock 0
        const all = [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const BATCH = 6;
        await afterChange(all.slice(offset, offset + BATCH));
        const next = offset + BATCH;
        res.json({ total: all.length, done: Math.min(next, all.length), next: next < all.length ? next : null });
    }));

    app.post('/api/nuvemshop/produtos/sync', auth, adminOnly, route(async (req, res) => {
        await afterChange([String(req.body.nome || '')]);
        const row = check(await supabase.from('nuvemshop_produtos').select('erro').eq('nome', norm(req.body.nome)).maybeSingle());
        res.json({ ok: !row?.erro, message: row?.erro || 'Produto sincronizado.' });
    }));

    app.post('/api/nuvemshop/pedidos/:id/resolver', auth, adminOnly, route(async (req, res) => {
        check(await supabase.from('nuvemshop_pedidos').update({ status: 'resolvido', itens_pendentes: [], erro: null }).eq('pedido_id', req.params.id));
        res.json({ message: 'Pedido marcado como resolvido.' });
    }));

    async function cronOk(req) {
        const conf = await supabase.from('cron_config').select('secret').eq('id', 1).maybeSingle();
        const secret = conf.data?.secret || '', got = String(req.headers.authorization || '').replace(/^Bearer /, '');
        return !!secret && got.length === secret.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
    }
    // Publishes hidden products that already have a photo and a description on Nuvemshop. Called in batches
    // (offset) from the database with the cron secret; returns the next offset until it is null.
    app.post('/api/cron/nuvemshop/publicar', route(async (req, res) => {
        if (!await cronOk(req)) return res.sendStatus(401);
        if (!cfg) return res.json({ skipped: 'sem configuração' });
        const offset = Math.max(0, parseInt(req.body?.offset, 10) || 0), BATCH = 8;
        const all = check(await supabase.from('nuvemshop_produtos').select('nome, product_id').not('product_id', 'is', null).order('nome'));
        const out = { total: all.length, publicados: [], next: offset + BATCH < all.length ? offset + BATCH : null };
        for (const m of all.slice(offset, offset + BATCH)) {
            const pr = await ns(`/products/${m.product_id}`).catch(() => null);
            const desc = String(valOf(pr?.description) || '').replace(/<[^>]*>/g, '').trim();
            if (!pr || pr.published || !(pr.images || []).length || !desc) continue;
            await ns(`/products/${m.product_id}`, { method: 'PUT', body: { published: true } });
            out.publicados.push(valOf(pr.name));
        }
        res.json(out);
    }));

    // --- Scheduled run (Supabase pg_cron calls it every 2 minutes) ---
    // Keeps both sides in step without the buttons: re-registers the order webhooks if they vanished, picks up
    // paid/cancelled orders whose webhook never arrived, and syncs products changed outside the site
    // (a database trigger queues their names in nuvemshop_fila).
    app.post('/api/cron/nuvemshop', route(async (req, res) => {
        if (!await cronOk(req)) return res.sendStatus(401);
        if (!cfg) return res.json({ skipped: 'sem configuração' });
        const out = { webhooks: 'ok', pedidos: 0, cancelados: 0, produtos: 0, erros: [] };
        try {
            const hooks = await ns('/webhooks');
            for (const event of EVENTS) if (!hooks.some(w => w.event === event && w.url === hookUrl)) {
                await ns('/webhooks', { method: 'POST', body: { event, url: hookUrl } }); out.webhooks = 'recriados';
            }
        } catch (err) { out.erros.push(`webhooks: ${err.message}`); }
        const since = new Date(Date.now() - 3 * 864e5).toISOString(); // webhooks normally arrive in seconds; 3 days covers outages
        try {
            const known = new Set(check(await supabase.from('nuvemshop_pedidos').select('pedido_id').gte('created_at', new Date(Date.now() - 10 * 864e5).toISOString())).map(r => r.pedido_id));
            const paid = await ns(`/orders?payment_status=paid&updated_at_min=${encodeURIComponent(since)}&per_page=50&fields=id`).catch(e => e.status === 404 ? [] : Promise.reject(e)); // 404 = no orders
            for (const o of paid) if (!known.has(String(o.id))) { await processPaid(o.id); out.pedidos++; }
            const cancelled = await ns(`/orders?status=cancelled&updated_at_min=${encodeURIComponent(since)}&per_page=50&fields=id`).catch(e => e.status === 404 ? [] : Promise.reject(e));
            for (const o of cancelled) if (known.has(String(o.id)) && await processCancelled(o.id) === 'cancelado') out.cancelados++;
        } catch (err) { out.erros.push(`pedidos: ${err.message}`); }
        const fila = check(await supabase.from('nuvemshop_fila').select('nome').order('created_at').limit(6)); // small batch: fits the function time limit
        if (fila.length) {
            await afterChange(fila.map(f => f.nome));
            await supabase.from('nuvemshop_fila').delete().in('nome', fila.map(f => f.nome)); // failures stay visible as product errors
            out.produtos = fila.length;
        }
        res.json(out);
    }));

    return { afterChange };
};
module.exports.matchingCombos = matchingCombos;
module.exports.baseName = baseName;
