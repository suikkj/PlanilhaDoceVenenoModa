# Projeto Planilha Doce Veneno

Sistema web de **gestão de estoque e financeiro** da loja **Doce Veneno**, construído para substituir planilhas manuais por uma plataforma moderna, segura e responsiva.

## ✨ Funcionalidades

- **🔐 Autenticação segura:** cadastro e login de usuários (senhas com hash via `bcrypt` e sessões com JWT).
- **📦 Gestão de estoque:** adicionar, editar, pesquisar e remover peças (nome, quantidade, cor, tamanho, preço de compra e venda).
- **💰 Registro de vendas:** marcar peças como vendidas com cálculo automático de lucro.
- **📊 Painel financeiro:** resumo com total vendido, custo total e lucro.
- **🎯 Ações em lote:** vender ou deletar múltiplas peças de uma só vez.
- **🌙 Tema escuro** responsivo.

## 🛠 Tecnologias

- **Backend:** Node.js + Express
- **Banco de dados / Backend as a Service:** Supabase (PostgreSQL)
- **Monitor de migrações:** `migration_script.js`
- **Frontend:** HTML + CSS + JavaScript vanilla (`public/`)
- **Deploy:** Vercel (`vercel.json`)

## 🚀 Como rodar

```bash
# 1. Instale as dependências
npm install

# 2. Configure as variáveis de ambiente em um arquivo .env (nunca commitar):
#    SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET, ADMIN_EMAILS (seu email, para aprovar usuários)

# 3. Inicie o servidor
npm start
```

> **Atenção:** nunca suba seu arquivo `.env` nem a *service-role key* do Supabase para o repositório.

## 🗂 Estrutura

```
├── server.js            # API Express
├── migration_script.js  # Migração/seed de dados
├── public/              # Frontend (HTML/CSS/JS)
├── supabase/            # Config e migrations do Supabase
├── vercel.json          # Configuração de deploy na Vercel
└── package.json
```

---

© Lucas Oliveira