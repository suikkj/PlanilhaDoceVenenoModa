// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const jwtSecret = process.env.JWT_SECRET;
// Comma-separated emails allowed to approve users, e.g. ADMIN_EMAILS=lucas@x.com
const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (!jwtSecret) console.error('CRÍTICO: JWT_SECRET não definido. Login não vai funcionar.');

const app = express();
app.use(express.json());

const allowedOrigins = ['https://docevenenoestoque.vercel.app'];
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000');
}
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Only these columns can be written from the browser.
const PECA_FIELDS = ['nome', 'quantidade', 'preco_comprado_unitario', 'preco_venda', 'cor', 'tamanho',
    'data_compra', 'status', 'data_venda', 'desconto', 'lucro',
    'forma_pagamento', 'cliente_nome', 'cliente_telefone', 'fornecedor'];
const pick = (obj = {}) => Object.fromEntries(Object.entries(obj).filter(([k]) => PECA_FIELDS.includes(k)));
const isAdmin = email => adminEmails.includes(String(email).toLowerCase());

function auth(req, res, next) {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token || !jwtSecret) return res.sendStatus(401);
    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.sendStatus(401);
        req.user = user;
        next();
    });
}
const adminOnly = (req, res, next) => isAdmin(req.user.email) ? next() : res.sendStatus(403);

// Wraps a handler so any thrown Supabase error becomes a 500 with its message.
const route = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
        console.error(req.method, req.path, err);
        res.status(500).json({ message: err.message || 'Erro no servidor.' });
    }
};
const check = ({ data, error }) => { if (error) throw error; return data; };

// --- Auth ---
app.post('/api/auth/register', route(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password || password.length < 6) {
        return res.status(400).json({ message: 'Informe um email e uma senha com pelo menos 6 caracteres.' });
    }
    const { data: existing } = await supabase.from('usuarios').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ message: 'Já existe uma conta com este email.' });

    const password_hash = await bcrypt.hash(password, 10);
    // Admins are active right away so the first account is never locked out.
    check(await supabase.from('usuarios').insert([{ email, password_hash, status: isAdmin(email) ? 'active' : 'pending' }]));
    res.status(201).json({ message: isAdmin(email) ? 'Conta criada. Já pode entrar.' : 'Conta criada. Aguarde a aprovação para entrar.' });
}));

app.post('/api/auth/login', route(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Informe email e senha.' });

    const user = check(await supabase.from('usuarios').select('*').eq('email', email).maybeSingle());
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(400).json({ message: 'Email ou senha incorretos.' });
    }
    if (user.status !== 'active') return res.status(403).json({ message: 'Sua conta ainda não foi aprovada.' });

    const accessToken = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
    res.json({ accessToken, email: user.email, isAdmin: isAdmin(user.email) });
}));

// --- Peças ---
app.get('/api/pecas', auth, route(async (req, res) => {
    res.json(check(await supabase.from('pecas').select('*').order('created_at', { ascending: false })));
}));

app.post('/api/pecas', auth, route(async (req, res) => {
    const peca = pick(req.body);
    if (!peca.nome || peca.preco_venda == null || !peca.quantidade) {
        return res.status(400).json({ message: 'Nome, quantidade e preço de venda são obrigatórios.' });
    }
    res.status(201).json(check(await supabase.from('pecas').insert([peca]).select('*'))[0]);
}));

app.patch('/api/pecas/batch', auth, route(async (req, res) => {
    const { ids, updates, action } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Nenhuma peça selecionada.' });
    if (action === 'delete') {
        check(await supabase.from('pecas').delete().in('id', ids));
        return res.json({ message: 'Peças apagadas.' });
    }
    if (!updates) return res.status(400).json({ message: 'Nada para atualizar.' });
    check(await supabase.from('pecas').update(pick(updates)).in('id', ids));
    res.json({ message: 'Peças atualizadas.' });
}));

app.put('/api/pecas/:id', auth, route(async (req, res) => {
    const rows = check(await supabase.from('pecas').update(pick(req.body)).eq('id', req.params.id).select('*'));
    if (!rows.length) return res.status(404).json({ message: 'Peça não encontrada.' });
    res.json(rows[0]);
}));

app.delete('/api/pecas/:id', auth, route(async (req, res) => {
    check(await supabase.from('pecas').delete().eq('id', req.params.id));
    res.json({ message: 'Peça apagada.' });
}));

// Read-only: months saved by the old version, shown alongside months computed from sales.
app.get('/api/historico', auth, route(async (req, res) => {
    res.json(check(await supabase.from('historico_mensal').select('*')));
}));

// --- Usuários (admin) ---
app.get('/api/admin/users', auth, adminOnly, route(async (req, res) => {
    res.json(check(await supabase.from('usuarios').select('id, email, status, created_at').order('created_at', { ascending: false })));
}));

app.patch('/api/admin/users/:id', auth, adminOnly, route(async (req, res) => {
    const { status } = req.body;
    if (!['active', 'pending', 'rejected'].includes(status)) return res.status(400).json({ message: 'Status inválido.' });
    check(await supabase.from('usuarios').update({ status }).eq('id', req.params.id));
    res.json({ message: 'Usuário atualizado.' });
}));

if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Servidor em http://localhost:${port}`));
}
module.exports = app;
