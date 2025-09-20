require('dotenv').config();
const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');

// --- Configurações ---
// MongoDB
const mongoUri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'docevenenoestoque'; // CORREÇÃO: Nome do DB

// Supabase
const supabaseUrl = process.env.SUPABASE_URL; // Adicione ao seu .env
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Adicione ao seu .env (use a Service Role Key)

if (!mongoUri || !supabaseUrl || !supabaseKey) {
    console.error('Verifique se MONGO_URI, SUPABASE_URL e SUPABASE_SERVICE_KEY estão no seu arquivo .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const mongoClient = new MongoClient(mongoUri);

// Função auxiliar para formatar datas
function formatarData(dataOriginal) {
    if (!dataOriginal) return null;
    
    let dataFormatada = null;
    try {
        if (typeof dataOriginal === 'string' && dataOriginal.includes('-')) {
            const parts = dataOriginal.split('-');
            if (parts.length === 2) { // Formato MM-DD
                const anoAtual = new Date().getFullYear();
                dataFormatada = `${anoAtual}-${parts[0]}-${parts[1]}`;
            }
        } else if (dataOriginal instanceof Date) {
            const ano = dataOriginal.getFullYear();
            const mes = String(dataOriginal.getMonth() + 1).padStart(2, '0');
            const dia = String(dataOriginal.getDate()).padStart(2, '0');
            dataFormatada = `${ano}-${mes}-${dia}`;
        }

        // Validação final
        if (dataFormatada && isNaN(new Date(dataFormatada).getTime())) {
            console.warn(`Data inválida encontrada: ${dataOriginal}. Será inserido como nulo.`);
            return null;
        }
        return dataFormatada;
    } catch (e) {
        console.warn(`Erro ao processar data: ${dataOriginal}. Será inserido como nulo.`);
        return null;
    }
}


async function migratePecas(db) {
    console.log('Iniciando migração de "pecas"...');
    const pecasCollection = db.collection('pecas');
    const pecas = await pecasCollection.find({}).toArray();

    const pecasParaInserir = pecas.map(p => {
        return {
            legacy_id: p.id,
            nome: p.nome,
            quantidade: p.quantidade,
            // CORREÇÃO: Usar o nome exato do campo do MongoDB (camelCase com 'C' e 'U' maiúsculos)
            preco_comprado_unitario: p.precoCompraUnitario, 
            preco_venda: p.venda,
            cor: p.cor,
            data_compra: formatarData(p.dataCompra),
            status: p.status,
            data_venda: formatarData(p.dataVenda),
            tamanho: p.tamanho
        };
    });

    if (pecasParaInserir.length > 0) {
        // Limpa a tabela antes de inserir para evitar duplicatas se rodar de novo
        console.log('Limpando a tabela "pecas" no Supabase antes de inserir...');
        const { error: deleteError } = await supabase.from('pecas').delete().neq('id', 0);
        if (deleteError) {
            console.error('Erro ao limpar a tabela de peças:', deleteError.message);
            return; // Para a execução se não conseguir limpar
        }

        console.log(`Tentando inserir ${pecasParaInserir.length} peças...`);
        const { data, error } = await supabase.from('pecas').insert(pecasParaInserir).select();
        if (error) {
            console.error('Erro ao migrar peças:', error.message);
            // Se houver erro, logar os detalhes pode ajudar a depurar
            if (error.details) console.error('Detalhes:', error.details);
        } else {
            console.log(`${data.length} peças migradas com sucesso!`);
        }
    } else {
        console.log('Nenhuma peça para migrar.');
    }
}

async function migrateUsuarios(db) {
    console.log('Iniciando migração de "usuarios"...');
    const usuariosCollection = db.collection('usuarios');
    const usuarios = await usuariosCollection.find({}).toArray();

    const usuariosParaInserir = usuarios.map(u => ({
        email: u.email,
        password_hash: u.password, // Mantém o hash bcrypt existente
        status: u.status,
        created_at: u.createdAt
    }));

    if (usuariosParaInserir.length > 0) {
        // ADICIONADO: Limpa a tabela antes de inserir
        console.log('Limpando a tabela "usuarios" no Supabase...');
        const { error: deleteError } = await supabase.from('usuarios').delete().neq('email', 'dummy-email-to-delete-all');
        if (deleteError) {
            console.error('Erro ao limpar a tabela de usuários:', deleteError.message);
            return;
        }

        const { data, error } = await supabase.from('usuarios').insert(usuariosParaInserir);
        if (error) {
            console.error('Erro ao migrar usuários:', error.message);
        } else {
            console.log(`${usuariosParaInserir.length} usuários migrados com sucesso!`);
        }
    } else {
        console.log('Nenhum usuário para migrar.');
    }
}

async function migrateHistorico(db) {
    console.log('Iniciando migração de "historicoMensal"...');
    const historicoCollection = db.collection('historicoMensal');
    const historicos = await historicoCollection.find({}).toArray();

    const historicoParaInserir = historicos.map(h => ({
        mes_ano: h.mesAno,
        faturamento: h.faturamento,
        lucro: h.lucro,
        pecas_vendidas: h.pecasVendidas
    }));

     if (historicoParaInserir.length > 0) {
        // ADICIONADO: Limpa a tabela antes de inserir
        console.log('Limpando a tabela "historico_mensal" no Supabase...');
        const { error: deleteError } = await supabase.from('historico_mensal').delete().neq('id', 0);
        if (deleteError) {
            console.error('Erro ao limpar a tabela de histórico:', deleteError.message);
            return;
        }

        const { data, error } = await supabase.from('historico_mensal').insert(historicoParaInserir);
        if (error) {
            console.error('Erro ao migrar histórico:', error.message);
        } else {
            console.log(`${historicoParaInserir.length} registros de histórico migrados com sucesso!`);
        }
    } else {
        console.log('Nenhum histórico para migrar.');
    }
}


async function main() {
    try {
        await mongoClient.connect();
        console.log('Conectado ao MongoDB.');
        const db = mongoClient.db(dbName);

        await migratePecas(db);
        await migrateUsuarios(db);
        await migrateHistorico(db);

    } catch (err) {
        console.error('Ocorreu um erro na migração:', err);
    } finally {
        await mongoClient.close();
        console.log('Conexão com MongoDB fechada.');
    }
}

main();