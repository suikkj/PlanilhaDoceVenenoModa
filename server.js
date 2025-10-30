// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js'); // NOVO
// const nodemailer = require('nodemailer'); // Mantenha se usar
// const { v4: uuidv4 } = require('uuid'); // Mantenha se usar
// const session = require('express-session'); // Remova se não for mais usar sessões baseadas em DB

// --- Configuração do Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use a chave de serviço no backend
const supabase = createClient(supabaseUrl, supabaseKey);


const app = express();
const port = process.env.PORT || 3000; // Porta para o backend rodar

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuração do CORS
// Permite requisições do seu frontend no Vercel
const allowedOrigins = [
  'https://docevenenoestoque.vercel.app' // Sua URL do frontend no Vercel
];

// Em ambiente de desenvolvimento, você pode querer adicionar o localhost
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://127.0.0.1:5500'); // Exemplo para Live Server do VSCode
    allowedOrigins.push('http://localhost:5500');
    allowedOrigins.push('http://localhost:3000'); // ADICIONADO: Para seu ambiente de teste local
}

const corsOptions = {
  origin: allowedOrigins,
  optionsSuccessStatus: 200, // Alguns navegadores legados (IE11, vários SmartTVs) engasgam com 204
  credentials: true, // Necessário se você planeja enviar cookies/sessões através de domínios
};
app.use(cors(corsOptions));

// Lida explicitamente com as requisições preflight para todas as rotas.
// O middleware acima geralmente já faz isso, mas ser explícito pode ajudar em alguns ambientes.
app.options('*', cors(corsOptions));


// Servir arquivos estáticos da pasta 'public'
// Coloque seus arquivos HTML, CSS, JS do frontend aqui
app.use(express.static(path.join(__dirname, 'public')));

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV === 'production') {
  console.error(
    'CRÍTICO: JWT_SECRET não está definido no ambiente de produção! ' +
    'A aplicação não pode operar de forma segura. Defina a variável de ambiente JWT_SECRET.'
  );
  // Em um cenário de produção, você pode querer impedir o servidor de iniciar:
  // process.exit(1); // Cuidado: Vercel pode tentar reiniciar. Logar é o mínimo.
}

// --- Middleware de Autenticação ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null || !jwtSecret) return res.sendStatus(401); // Se não há token ou secret, não autorizado

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.sendStatus(403); // Se o token não é válido, proibido
        req.user = user;
        next(); // Token válido, prossegue para a rota
    });
}

// --- Rotas de Autenticação ---

// Registro de Usuário
// Para "pessoas selecionadas por mim", você pode:
// 1. Chamar esta rota manualmente (via Postman/curl) para criar os usuários.
// 2. Criar uma página de registro separada e protegida que só você acessa.
// 3. Implementar um sistema de convites/aprovação (mais complexo).
// Por simplicidade, esta rota está aberta, mas em produção você a protegeria ou não a exporia diretamente.
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
        }

        const { data: existingUser, error: fetchError } = await supabase
            .from('usuarios')
            .select('id')
            .eq('email', email)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError; // Erro diferente de "não encontrado"
        }

        if (existingUser) {
            return res.status(400).json({ message: 'Usuário já existe com este email.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { error: insertError } = await supabase
            .from('usuarios')
            .insert([{ email, password_hash: hashedPassword, status: 'pending', created_at: new Date() }]); // CORRIGIDO

        if (insertError) {
            throw insertError;
        }

        res.status(201).json({ message: 'Usuário registrado com sucesso! Aguardando aprovação.' });
    } catch (err) {
        console.error('Erro ao registrar usuário:', err); // Adicionado log do erro no servidor
        res.status(500).json({ message: 'Erro ao registrar usuário', error: err.message });
    }
});

// Login de Usuário
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
        }

        const { data: user, error: fetchError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        if (fetchError) {
            // If the specific error is "user not found" (PGRST116), that's a normal 400.
            if (fetchError.code === 'PGRST116') {
                return res.status(400).json({ message: 'Credenciais inválidas.' });
            }
            // For any other database error, it's a server-side problem.
            console.error('Supabase login error:', fetchError);
            return res.status(500).json({ message: 'Erro no servidor ao tentar autenticar.' });
        }

        // Fallback check, though Supabase's .single() should prevent this case.
        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        if (user.status !== 'active') {
             return res.status(403).json({ message: 'Sua conta ainda não foi ativada pelo administrador.' });
        }

        // Check if password hash exists to prevent bcrypt error on corrupt user data
        if (!user.password_hash) {
            console.error(`Login attempt for user ${email} failed: no password hash found in database.`);
            return res.status(500).json({ message: 'Erro no servidor: conta de usuário inválida.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        // Usuário autenticado, gerar JWT
        const accessToken = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' }); // Token expira em 7 dias

        res.json({ accessToken });
    } catch (err) {
        console.error('Erro inesperado ao fazer login:', err);
        res.status(500).json({ message: 'Erro ao fazer login', error: err.message });
    }
});

// --- Rotas da API (Endpoints) ---

// PEÇAS
// Obter todas as peças
app.get('/api/pecas', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pecas')
            .select('*');

        if (error) {
            // O erro do Supabase já contém detalhes úteis
            throw error;
        }

        res.json(data);
    } catch (err) {
        console.error('Erro ao buscar peças no Supabase:', err.message);
        res.status(500).json({ message: 'Erro ao buscar peças', error: err.message });
    }
});

// Adicionar nova peça
app.post('/api/pecas', authenticateToken, async (req, res) => {
    try {
        const novaPeca = req.body;
        novaPeca.id = novaPeca.id || Date.now(); // Garante um ID se não vier do cliente ou usa o do cliente

        if (!novaPeca.nome || !novaPeca.preco_venda || !novaPeca.quantidade) {
            return res.status(400).json({ message: 'Campos obrigatórios faltando.' });
        }

        const { data, error } = await supabase
            .from('pecas')
            .insert([novaPeca])
            .select('*');

        if (error) {
            throw error;
        }

        res.status(201).json(data[0]);
    } catch (err) {
        console.error('Erro detalhado ao adicionar peça:', err);
        res.status(500).json({ message: 'Erro ao adicionar peça', error: err.message });
    }
});

// Atualizar uma peça (ex: editar, marcar como vendida)
app.put('/api/pecas/:pecaId', authenticateToken, async (req, res) => {
    let updates; // Declare fora do try
    try {
        const pecaId = req.params.pecaId;
        updates = req.body;
        delete updates._id; // Não atualize o _id do MongoDB

        const { data, error } = await supabase
            .from('pecas')
            .update(updates)
            .eq('id', pecaId)
            .select('*');

        if (error) {
            throw error;
        }

        res.json(data[0]);
    } catch (err) {
        console.error('Erro detalhado ao atualizar peça:', err, updates); // Agora updates está definido
        res.status(500).json({ message: 'Erro ao atualizar peça', error: err.message });
    }
});

 // Atualizar múltiplas peças (ex: vender selecionados, deletar selecionados)
 app.patch('/api/pecas/batch', authenticateToken, async (req, res) => {
     try {
         const { ids, updates, action } = req.body; // ids: array de IDs numéricos

         if (!ids || !Array.isArray(ids) || ids.length === 0) {
             return res.status(400).json({ message: 'IDs não fornecidos ou inválidos.' });
         }

         if (action === 'delete') {
             const { error } = await supabase
                 .from('pecas')
                 .delete()
                 .in('id', ids);

             if (error) {
                 throw error;
             }

             return res.json({ message: `Peças deletadas com sucesso.` });
         } else if (updates) {
             const { error } = await supabase
                 .from('pecas')
                 .update(updates)
                 .in('id', ids);

             if (error) {
                 throw error;
             }

             return res.json({ message: `Peças atualizadas com sucesso.` });
         } else {
             return res.status(400).json({ message: 'Ação ou atualizações inválidas para operação em lote.' });
         }
     } catch (err) {
         res.status(500).json({ message: 'Erro na operação em lote de peças', error: err.message });
     }
 });


// Deletar uma peça
app.delete('/api/pecas/:pecaId', authenticateToken, async (req, res) => {
    try {
        const pecaId = req.params.pecaId;

        const { error } = await supabase
            .from('pecas')
            .delete()
            .eq('id', pecaId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Peça deletada com sucesso' });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao deletar peça', error: err.message });
    }
});


// HISTÓRICO MENSAL
// Obter histórico mensal
app.get('/api/historico', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('historico_mensal') // CORRIGIDO
            .select('*');

        if (error) {
            throw error;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar histórico mensal', error: err.message });
    }
});

// Salvar/Atualizar histórico mensal (exemplo: substitui tudo, como no localStorage)
// Uma abordagem mais granular seria usar upsert por mês/ano.
app.post('/api/historico', authenticateToken, async (req, res) => {
    try {
        const historicoData = req.body; // Espera um array de objetos de histórico

        // Limpa o existente
        const { error: deleteError } = await supabase
            .from('historico_mensal') // CORRIGIDO
            .delete()
            .neq('id', 0); // Deletar todos os registros

        if (deleteError) {
            throw deleteError;
        }

        // Insere os novos dados
        const { error: insertError } = await supabase
            .from('historico_mensal') // CORRIGIDO
            .insert(historicoData);

        if (insertError) {
            throw insertError;
        }

        res.status(201).json({ message: 'Histórico mensal salvo com sucesso' });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao salvar histórico mensal', error: err.message });
    }
});

app.listen(port, () => {
    // Não precisa mais conectar ao DB aqui
    console.log(`Servidor rodando em http://localhost:${port} e conectado ao Supabase.`);
});
