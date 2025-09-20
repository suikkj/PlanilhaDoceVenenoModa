// js/vendas_script.js
document.addEventListener('DOMContentLoaded', async () => {
    const tabelaVendasBody = document.getElementById('tabelaVendas').getElementsByTagName('tbody')[0];
    const totalArrecadadoVendasEl = document.getElementById('totalArrecadadoVendas');
    const lucroTotalComVendasEl = document.getElementById('lucroTotalComVendas');
    const qtdPecasVendidasEl = document.getElementById('qtdPecasVendidas');

    let todasAsPecas = [];
 
    // Verifica se o usuário está logado. Se não, redireciona e para a execução do script.
    if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    function renderizarTabelaVendas() {
        tabelaVendasBody.innerHTML = '';
        const pecasVendidas = todasAsPecas.filter(p => p.status === 'vendida');

        if (pecasVendidas.length === 0) {
            const tr = tabelaVendasBody.insertRow();
            const td = tr.insertCell();
            td.setAttribute('colspan', '10'); // Ajustado para 10 colunas (incluindo Ações)
            td.textContent = 'Nenhuma peça vendida registrada.';
            td.style.textAlign = 'center';
            return;
        }

        pecasVendidas.sort((a, b) => {
                // Lógica de ordenação mais segura
                // Coloca itens sem data de venda no final da lista
                if (!a.data_venda) return 1; // CORRIGIDO
                if (!b.data_venda) return -1; // CORRIGIDO

                // Compara as datas diretamente (já estão em formato YYYY-MM-DD)
                const dateA = new Date(a.data_venda); // CORRIGIDO
                const dateB = new Date(b.data_venda); // CORRIGIDO
                return dateB - dateA; // Mais recentes primeiro
            })
            .forEach(peca => {
            const tr = tabelaVendasBody.insertRow();
            // CORREÇÃO: Usar os nomes de coluna do Supabase (snake_case)
            const lucroDaVenda = (peca.preco_venda * peca.quantidade) - (peca.preco_comprado_unitario * peca.quantidade);

            tr.insertCell().textContent = peca.nome;
            tr.insertCell().textContent = peca.cor || '-';
            tr.insertCell().textContent = peca.tamanho || '-'; // Adicionada célula para Tamanho
            tr.insertCell().textContent = peca.quantidade;
            tr.insertCell().textContent = formatarData(peca.data_compra); // CORRIGIDO
            tr.insertCell().textContent = formatarData(peca.data_venda); // CORRIGIDO

            const precoCompraTd = tr.insertCell();
            // CORREÇÃO:
            precoCompraTd.textContent = formatarMoeda(peca.preco_comprado_unitario);
            precoCompraTd.classList.add('currency');

            const precoVendaTd = tr.insertCell();
            // CORREÇÃO:
            const precoVendaTotal = peca.preco_venda * peca.quantidade;
            precoVendaTd.textContent = formatarMoeda(precoVendaTotal);
            precoVendaTd.classList.add('currency');

            const lucroVendaTd = tr.insertCell();
            lucroVendaTd.textContent = formatarMoeda(lucroDaVenda);
            lucroVendaTd.classList.add('currency');
            lucroVendaTd.classList.toggle('text-profit', lucroDaVenda >= 0);
            lucroVendaTd.classList.toggle('text-loss', lucroDaVenda < 0);

            const acoesTd = tr.insertCell();
            const btnRetornarEstoque = document.createElement('button');
            btnRetornarEstoque.textContent = 'Devolver ao Estoque';
            btnRetornarEstoque.onclick = () => retornarAoEstoque(peca.id);
            btnRetornarEstoque.style.marginRight = '5px';

            const btnDeletarVenda = document.createElement('button');
            btnDeletarVenda.textContent = 'Deletar Registro';
            btnDeletarVenda.onclick = () => deletarRegistroVenda(peca.id, peca.nome);

            btnDeletarVenda.classList.add('btn-delete');


            acoesTd.appendChild(btnRetornarEstoque);
            acoesTd.appendChild(btnDeletarVenda);
        });
    }

    function atualizarResumoVendas() {
        const pecasVendidas = todasAsPecas.filter(p => p.status === 'vendida');
        // CORREÇÃO:
        const totalArrecadado = pecasVendidas.reduce((acc, p) => acc + (p.preco_venda * p.quantidade), 0);
        const lucroTotal = pecasVendidas.reduce((acc, p) => acc + ((p.preco_venda * p.quantidade) - p.preco_comprado_unitario), 0);
        const totalUnidadesVendidas = pecasVendidas.reduce((acc, p) => acc + p.quantidade, 0);

        totalArrecadadoVendasEl.textContent = formatarMoeda(totalArrecadado);
        lucroTotalComVendasEl.textContent = formatarMoeda(lucroTotal);
        lucroTotalComVendasEl.classList.toggle('text-loss', lucroTotal < 0);
        qtdPecasVendidasEl.textContent = pecasVendidas.length;
        qtdPecasVendidasEl.textContent = totalUnidadesVendidas;
    }

    async function retornarAoEstoque(pecaId) {
        const pecaIndex = todasAsPecas.findIndex(p => p.id === pecaId);
        if (pecaIndex > -1) {
            const pecaNome = todasAsPecas[pecaIndex].nome;
            showConfirmationModal(
                'Confirmar Devolução',
                `Tem certeza que deseja devolver a peça "${pecaNome}" ao estoque?`,
                async () => { // Tornar o callback assíncrono
                    const updates = { status: 'estoque', data_venda: null }; // CORRIGIDO
                    const resultado = await updatePecaAPI(pecaId, updates); // Chama a função API
                    if (resultado) { // Verifica se a operação foi bem-sucedida
                        await inicializarPagina(); // Recarrega os dados e renderiza
                        showNotificationModal('Sucesso', `Peça "${pecaNome}" retornada ao estoque!`);
                    }
                }
            );
        }
    }

    function deletarRegistroVenda(pecaId, pecaNome) {
         showConfirmationModal(
            'Confirmar Exclusão',
            `Tem certeza que deseja deletar o registro de venda da peça "${pecaNome}"? Esta ação não pode ser desfeita.`,
            async () => { // Tornar o callback assíncrono
                const resultado = await deletePecaAPI(pecaId); // Chama a função API para deletar a peça
                if (resultado) { // Verifica se a operação foi bem-sucedida
                    await inicializarPagina(); // Recarrega os dados e renderiza
                    showNotificationModal('Sucesso', `Registro de venda da peça "${pecaNome}" deletado!`);
                }
            }
        );
    }

    async function inicializarPagina() {
        todasAsPecas = await carregarPecas(); // Carrega as peças do backend
        renderizarTabelaVendas();
        atualizarResumoVendas();
    }

    await inicializarPagina();
});