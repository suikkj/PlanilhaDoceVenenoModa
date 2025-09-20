# Doce Veneno - Sistema de Gestão de Estoque



## 📝 Descrição

**Doce Veneno** é uma aplicação web desenvolvida para simplificar o gerenciamento de estoque e o registro de vendas de uma loja de roupas. O sistema substitui planilhas manuais por uma interface moderna, intuitiva e segura, permitindo o controle total das peças, desde a compra até a venda final, com cálculo automático de lucro.

A aplicação conta com autenticação de usuários, garantindo que apenas pessoas autorizadas tenham acesso aos dados. O design é responsivo e possui um tema escuro elegante para uma experiência de uso confortável.

---

## ✨ Funcionalidades Principais

-   **🔐 Autenticação Segura:** Sistema de Login e Registro de usuários.
-   **📦 Gestão de Estoque:**
    -   Adicionar novas peças ao estoque com informações detalhadas (nome, quantidade, cor, tamanho, preço de compra e venda).
    -   Editar informações de peças existentes.
    -   Remover peças do estoque.
-   **💰 Registro de Vendas:**
    -   Marcar peças como vendidas, movendo-as do estoque para o histórico.
    -   Cálculo automático do lucro para cada venda.
-   **📊 Histórico de Vendas:**
    -   Página dedicada para visualizar todas as vendas realizadas.
    -   Resumo financeiro com total vendido, custo total e lucro total.
-   **🔍 Pesquisa e Filtros:** Funcionalidade de busca em tempo real para encontrar peças rapidamente no estoque.
-   **✅ Ações em Lote:** Selecione múltiplas peças para vender ou deletar de uma só vez.
-   **🎨 Tema Escuro:** Interface com um tema escuro moderno para melhor visualização e conforto.

---

## 🚀 Tecnologias Utilizadas

O projeto foi construído com as seguintes tecnologias:

-   **Frontend:**
    -   HTML5
    -   CSS3 (com Variáveis, Flexbox e Grid)
    -   JavaScript (Vanilla JS, ES6+)
-   **Backend:**
    -   Node.js
    -   Express.js
-   **Banco de Dados:**
    -   Supabase (utilizando PostgreSQL)
-   **Hospedagem:**
    -   Render.com

---

## ⚙️ Como Executar o Projeto Localmente

Siga os passos abaixo para configurar e rodar a aplicação em seu ambiente de desenvolvimento.

### Pré-requisitos

-   [Node.js](https://nodejs.org/en/) (versão 18 ou superior)
-   [npm](https://www.npmjs.com/) (geralmente instalado com o Node.js)
-   Uma conta no [Supabase](https://supabase.com/) para criar o banco de dados.

### Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/seu-repositorio.git
    cd seu-repositorio
    ```

2.  **Instale as dependências do backend:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    -   Crie um arquivo chamado `.env` na raiz do projeto.
    -   Adicione as suas chaves do Supabase a este arquivo:

    ```env
    SUPABASE_URL=SUA_URL_DO_SUPABASE
    SUPABASE_KEY=SUA_CHAVE_ANON_PUBLICA_DO_SUPABASE
    ```
    > Você pode encontrar essas chaves no painel do seu projeto Supabase, em **Project Settings > API**.

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```
    ou
    ```bash
    node server.js
    ```

5.  **Acesse a aplicação:**
    Abra seu navegador e acesse `http://localhost:3000`.

---

## 📁 Estrutura do Projeto

```
/
├── public/
│   ├── css/
│   │   ├── style.css
│   │   └── auth_style.css
│   ├── js/
│   │   ├── auth.js
│   │   ├── common.js
│   │   └── estoque_script.js
│   ├── imagens/
│   ├── index.html
│   ├── login.html
│   └── register.html
├── .env.example         # Exemplo de variáveis de ambiente
├── server.js            # Servidor Express
├── package.json
└── README.md
```

---

## 👨‍💻 Autor

Desenvolvido por **Lucas**.
# filepath: c:\Users\lucas\Documents\Projetos programação\Projeto Planilha Doce Veneno\README.md
# Doce Veneno - Sistema de Gestão de Estoque



## 📝 Descrição

**Doce Veneno** é uma aplicação web desenvolvida para simplificar o gerenciamento de estoque e o registro de vendas de uma loja de roupas. O sistema substitui planilhas manuais por uma interface moderna, intuitiva e segura, permitindo o controle total das peças, desde a compra até a venda final, com cálculo automático de lucro.

A aplicação conta com autenticação de usuários, garantindo que apenas pessoas autorizadas tenham acesso aos dados. O design é responsivo e possui um tema escuro elegante para uma experiência de uso confortável.

---

## ✨ Funcionalidades Principais

-   **🔐 Autenticação Segura:** Sistema de Login e Registro de usuários.
-   **📦 Gestão de Estoque:**
    -   Adicionar novas peças ao estoque com informações detalhadas (nome, quantidade, cor, tamanho, preço de compra e venda).
    -   Editar informações de peças existentes.
    -   Remover peças do estoque.
-   **💰 Registro de Vendas:**
    -   Marcar peças como vendidas, movendo-as do estoque para o histórico.
    -   Cálculo automático do lucro para cada venda.
-   **📊 Histórico de Vendas:**
    -   Página dedicada para visualizar todas as vendas realizadas.
    -   Resumo financeiro com total vendido, custo total e lucro total.
-   **🔍 Pesquisa e Filtros:** Funcionalidade de busca em tempo real para encontrar peças rapidamente no estoque.
-   **✅ Ações em Lote:** Selecione múltiplas peças para vender ou deletar de uma só vez.
-   **🎨 Tema Escuro:** Interface com um tema escuro moderno para melhor visualização e conforto.

---

## 🚀 Tecnologias Utilizadas

O projeto foi construído com as seguintes tecnologias:

-   **Frontend:**
    -   HTML5
    -   CSS3 (com Variáveis, Flexbox e Grid)
    -   JavaScript (Vanilla JS, ES6+)
-   **Backend:**
    -   Node.js
    -   Express.js
-   **Banco de Dados:**
    -   Supabase (utilizando PostgreSQL)
-   **Hospedagem:**
    -   Render.com

---

## ⚙️ Como Executar o Projeto Localmente

Siga os passos abaixo para configurar e rodar a aplicação em seu ambiente de desenvolvimento.

### Pré-requisitos

-   [Node.js](https://nodejs.org/en/) (versão 18 ou superior)
-   [npm](https://www.npmjs.com/) (geralmente instalado com o Node.js)
-   Uma conta no [Supabase](https://supabase.com/) para criar o banco de dados.

### Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/seu-repositorio.git
    cd seu-repositorio
    ```

2.  **Instale as dependências do backend:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    -   Crie um arquivo chamado `.env` na raiz do projeto.
    -   Adicione as suas chaves do Supabase a este arquivo:

    ```env
    SUPABASE_URL=SUA_URL_DO_SUPABASE
    SUPABASE_KEY=SUA_CHAVE_ANON_PUBLICA_DO_SUPABASE
    ```
    > Você pode encontrar essas chaves no painel do seu projeto Supabase, em **Project Settings > API**.

4.  **Inicie o servidor:**
    ```bash
    npm start
    ```
    ou
    ```bash
    node server.js
    ```

5.  **Acesse a aplicação:**
    Abra seu navegador e acesse `http://localhost:3000`.

---

## 📁 Estrutura do Projeto

```
/
├── public/
│   ├── css/
│   │   ├── style.css
│   │   └── auth_style.css
│   ├── js/
│   │   ├── auth.js
│   │   ├── common.js
│   │   └── estoque_script.js
│   ├── imagens/
│   ├── index.html
│   ├── login.html
│   └── register.html
├── .env.example         # Exemplo de variáveis de ambiente
├── server.js            # Servidor Express
├── package.json
└── README.md
```

---

## 👨‍💻 Autor

Desenvolvido por **Lucas**.