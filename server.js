// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const jwtSecret = process.env.JWT_SECRET;
// Comma-separated emails allowed to approve users, e.g. ADMIN_EMAILS=lucas@x.com
const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (!jwtSecret) console.error('CRÍTICO: JWT_SECRET não definido. Login não vai funcionar.');
// Links in emails always use this address, never the request's Host header (which a caller can forge).
const APP_URL = (process.env.APP_URL || 'https://planilhadoceveneno.vercel.app').replace(/\/$/, '');
const mailer = process.env.EMAIL_USER && process.env.EMAIL_PASS
    ? nodemailer.createTransport({ service: process.env.EMAIL_SERVICE || 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } })
    : null;
// `to` is an address, or { to, bcc } for mass sends.
const sendMail = (to, subject, text, attachments) =>
    mailer.sendMail({ from: `Doce Veneno Estoque <${process.env.EMAIL_USER}>`, ...(typeof to === 'string' ? { to } : to), subject, text, attachments });
// Fingerprint of the current password hash: a reset link stops working once the password changes.
const pwTag = hash => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);

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
        if (err || user.purpose) return res.sendStatus(401); // reset-link tokens are not logins
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

const RESET_SENT = { message: 'Se esse email tiver conta, enviamos um link para criar uma nova senha. Confira também a caixa de spam.' };
app.post('/api/auth/forgot', route(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Informe seu email.' });
    if (!mailer) return res.status(503).json({ message: 'O envio de email não está configurado. Peça ao administrador uma senha temporária.' });
    const user = check(await supabase.from('usuarios').select('id, password_hash').eq('email', email).maybeSingle());
    if (user?.password_hash) {
        const token = jwt.sign({ purpose: 'reset', uid: user.id, pw: pwTag(user.password_hash) }, jwtSecret, { expiresIn: '30m' });
        await sendMail(email, 'Criar nova senha: Doce Veneno Estoque',
            `Para criar uma nova senha, abra este link:\n\n${APP_URL}/?reset=${token}\n\nO link vale por 30 minutos e só pode ser usado uma vez. Se você não pediu, ignore este email; sua senha continua a mesma.`);
    }
    res.json(RESET_SENT); // same answer whether or not the email exists
}));

app.post('/api/auth/reset', route(async (req, res) => {
    const { token, password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ message: 'A senha precisa ter pelo menos 6 caracteres.' });
    let data;
    try { data = jwt.verify(String(token), jwtSecret); } catch { data = null; }
    if (!data || data.purpose !== 'reset') return res.status(400).json({ message: 'Este link expirou ou é inválido. Peça um novo em "Esqueci minha senha".' });
    const user = check(await supabase.from('usuarios').select('id, password_hash').eq('id', data.uid).maybeSingle());
    if (!user || pwTag(user.password_hash) !== data.pw) return res.status(400).json({ message: 'Este link já foi usado. Peça um novo em "Esqueci minha senha".' });
    check(await supabase.from('usuarios').update({ password_hash: await bcrypt.hash(password, 10) }).eq('id', user.id));
    res.json({ message: 'Senha alterada. Já pode entrar com a nova senha.' });
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

app.post('/api/admin/users/:id/temp-password', auth, adminOnly, route(async (req, res) => {
    const ABC = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/l/I) or symbols, easy to dictate
    const password = Array.from(crypto.randomBytes(8), b => ABC[b % ABC.length]).join('');
    const rows = check(await supabase.from('usuarios').update({ password_hash: await bcrypt.hash(password, 10) }).eq('id', req.params.id).select('email'));
    if (!rows.length) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json({ email: rows[0].email, password });
}));

// --- Planilha completa e backup ---
const PAY = { pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', dinheiro: 'Dinheiro' };
function fullCsv(pecas) {
    const num = v => v == null || v === '' ? '' : (Number(v) || 0).toFixed(2).replace('.', ',');
    const date = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
    const cell = v => /[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
    const head = ['Situação', 'Peça', 'Cor', 'Tamanho', 'Quantidade', 'Comprada em', 'Preço de compra', 'Preço de venda',
        'Vendida em', 'Desconto %', 'Lucro', 'Pagamento', 'Cliente', 'Telefone', 'Fornecedor'];
    const rows = [...pecas].sort((a, b) => (a.status === 'vendida') - (b.status === 'vendida') || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
        .map(p => [p.status === 'vendida' ? 'Vendida' : 'Em estoque', p.nome, p.cor, p.tamanho, p.quantidade, date(p.data_compra),
            num(p.preco_comprado_unitario), num(p.preco_venda), date(p.data_venda), p.desconto ?? '', num(p.lucro),
            PAY[p.forma_pagamento] || '', p.cliente_nome, p.cliente_telefone, p.fornecedor]);
    return '\ufeff' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
}
const allPecas = async () => check(await supabase.from('pecas').select('*').order('created_at', { ascending: true }));

app.get('/api/export', auth, route(async (req, res) => {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.send(fullCsv(await allPecas()));
}));

// Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
app.get('/api/cron/backup', route(async (req, res) => {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
    if (!mailer) return res.status(503).json({ message: 'Configure EMAIL_USER e EMAIL_PASS para enviar o backup.' });
    const [pecas, historico, usuarios] = await Promise.all([
        allPecas(),
        supabase.from('historico_mensal').select('*').then(check),
        supabase.from('usuarios').select('id, email, status, created_at').then(check), // never the password hashes
    ]);
    // Every approved account plus the admins; sent as Bcc so recipients don't see each other's addresses.
    const recipients = [...new Set([...usuarios.filter(u => u.status === 'active').map(u => u.email.toLowerCase()), ...adminEmails])];
    if (!recipients.length) return res.status(503).json({ message: 'Nenhum usuário ativo para receber o backup.' });
    const day = new Date().toISOString().slice(0, 10);
    const emEstoque = pecas.filter(p => p.status !== 'vendida').reduce((n, p) => n + (Number(p.quantidade) || 0), 0);
    await sendMail({ to: process.env.EMAIL_USER, bcc: recipients }, `Backup semanal Doce Veneno ${day.split('-').reverse().join('/')}`,
        `Backup automático do estoque.\n\n${emEstoque} peças em estoque, ${pecas.length} registros no total.\n\n` +
        `A planilha abre no Excel. O arquivo .json guarda tudo para restaurar o sistema se for preciso; guarde-o em lugar seguro.`,
        [{ filename: `doce-veneno-${day}.csv`, content: fullCsv(pecas) },
         { filename: `doce-veneno-backup-${day}.json`, content: JSON.stringify({ geradoEm: new Date().toISOString(), pecas, historico_mensal: historico, usuarios }, null, 2) }]);
    res.json({ message: `Backup enviado para ${recipients.length} ${recipients.length === 1 ? 'pessoa' : 'pessoas'}.` });
}));

if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Servidor em http://localhost:${port}`));
}
module.exports = app;
