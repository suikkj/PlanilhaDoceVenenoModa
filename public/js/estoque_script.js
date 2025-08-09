// js/estoque_script.js
document.addEventListener('DOMContentLoaded', async () => {
    const formNovaPeca = document.getElementById('formNovaPeca');
    const tabelaEstoqueBody = document.getElementById('tabelaEstoque').getElementsByTagName('tbody')[0];
    const totalInvestidoEstoqueEl = document.getElementById('totalInvestidoEstoque');
    const lucroPotencialEstoqueEl = document.getElementById('lucroPotencialEstoque');
    const qtdPecasEstoqueEl = document.getElementById('qtdPecasEstoque');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const btnVenderSelecionados = document.getElementById('btnVenderSelecionados');
    const btnDeletarSelecionados = document.getElementById('btnDeletarSelecionados');
    const searchInputEstoque = document.getElementById('searchInputEstoque'); // Elemento da barra de pesquisa
    
    let todasAsPecas = [];
 
    // Verifica se o usuário está logado. Se não, redireciona e para a execução do script.
    if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    function atualizarPrecoVenda(peca) {
        const quantidadeInput = document.getElementById('sellQuantidade');
        const descontoInput = document.getElementById('sellDesconto');
        const precoFinalSpan = document.getElementById('sellPrecoFinal');
        const totalVendaSpan = document.getElementById('sellTotalVenda');

        if (!quantidadeInput || !descontoInput || !precoFinalSpan || !totalVendaSpan) {
            return;
        }

        const quantidade = parseInt(quantidadeInput.value, 10) || 0;
        const desconto = parseFloat(descontoInput.value) || 0;
        const precoVendaOriginal = parseFloat(peca.venda);

        if (isNaN(quantidade) || isNaN(desconto) || isNaN(precoVendaOriginal) || desconto < 0 || desconto > 100) {
            precoFinalSpan.textContent = formatarMoeda(0);
            totalVendaSpan.textContent = formatarMoeda(0);
            return;
        }

        const precoComDesconto = precoVendaOriginal * (1 - (desconto / 100));
        const totalVenda = precoComDesconto * quantidade;

        precoFinalSpan.textContent = formatarMoeda(precoComDesconto);
        totalVendaSpan.textContent = formatarMoeda(totalVenda);
    }

    function getSelectedPecaIds() {
        const selectedIds = [];
        document.querySelectorAll('.peca-checkbox:checked').forEach(checkbox => {
            selectedIds.push(parseInt(checkbox.dataset.id));
        });
        return selectedIds;
    }

    function renderizarTabelaEstoque() {
        tabelaEstoqueBody.innerHTML = '';
        const termoPesquisa = searchInputEstoque ? searchInputEstoque.value.toLowerCase().trim() : "";

        let pecasFiltradas = todasAsPecas.filter(p => p.status === 'estoque');

        if (termoPesquisa) {
            pecasFiltradas = pecasFiltradas.filter(peca => {
                const nomePeca = peca.nome.toLowerCase();
                const corPeca = (peca.cor || '').toLowerCase(); // Trata cor nula ou vazia
                return nomePeca.includes(termoPesquisa) || corPeca.includes(termoPesquisa);
            });
        }

        if (pecasFiltradas.length === 0) {
            const tr = tabelaEstoqueBody.insertRow();
            const td = tr.insertCell();
            td.setAttribute('colspan', '10'); // Aumentado o colspan devido à nova coluna
            td.style.textAlign = 'center';
            if (termoPesquisa) {
                td.textContent = `Nenhum resultado encontrado para "${searchInputEstoque.value}".`;
            } else {
                td.textContent = 'Nenhuma peça em estoque.';
            }
            return;
        }

        pecasFiltradas.forEach(peca => {
            const tr = tabelaEstoqueBody.insertRow();
            // CORREÇÃO: Usar os nomes de coluna do Supabase (snake_case)
            const lucroPotencial = (peca.preco_venda * peca.quantidade) - (peca.preco_comprado_unitario * peca.quantidade);

            const checkboxTd = tr.insertCell();
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('peca-checkbox');
            checkbox.dataset.id = peca.id;
            checkboxTd.appendChild(checkbox);

            tr.insertCell().textContent = peca.nome;
            tr.insertCell().textContent = peca.cor || '-';
            tr.insertCell().textContent = peca.tamanho || '-'; // Adicionada célula para Tamanho
            tr.insertCell().textContent = peca.quantidade;
            const dataCompraTd = tr.insertCell();
            dataCompraTd.textContent = formatarData(peca.data_compra);        

            const precoCompraTd = tr.insertCell();
            // CORREÇÃO:
            precoCompraTd.textContent = formatarMoeda(peca.preco_comprado_unitario);

            const precoVendaTd = tr.insertCell();
            // CORREÇÃO:
            precoVendaTd.textContent = formatarMoeda(peca.preco_venda);
            
            const lucroPotencialTd = tr.insertCell();
            lucroPotencialTd.textContent = formatarMoeda(lucroPotencial);
            lucroPotencialTd.classList.toggle('text-profit', lucroPotencial >= 0);
            lucroPotencialTd.classList.toggle('text-loss', lucroPotencial < 0);

            const acoesTd = tr.insertCell();
            acoesTd.style.minWidth = '150px';
            
            const btnVender = document.createElement('button');
            btnVender.textContent = 'Vender';
            btnVender.onclick = () => abrirModalVendaComQuantidade(peca);
            btnVender.style.marginRight = '5px';

            const btnEditar = document.createElement('button');
            btnEditar.textContent = 'Editar';
            btnEditar.onclick = () => editarPeca(peca.id); // Implementar função editarPeca
            btnEditar.style.marginRight = '5px';

            const btnDeletar = document.createElement('button');
            btnDeletar.textContent = 'Deletar';
            btnDeletar.onclick = () => deletarPecaComConfirmacao(peca.id, peca.nome);
            btnDeletar.classList.add('btn-delete');

            acoesTd.appendChild(btnVender);
            acoesTd.appendChild(btnEditar);
            acoesTd.appendChild(btnDeletar);
        });
    }

    function atualizarResumoEstoque() {
        const pecasEmEstoque = todasAsPecas.filter(p => p.status === 'estoque');
        // CORREÇÃO:
        const totalInvestido = pecasEmEstoque.reduce((acc, p) => acc + (p.preco_comprado_unitario * p.quantidade), 0);
        const lucroPotencialTotal = pecasEmEstoque.reduce((acc, p) => acc + ((p.preco_venda * p.quantidade) - (p.preco_comprado_unitario * p.quantidade)), 0);

        totalInvestidoEstoqueEl.textContent = formatarMoeda(totalInvestido);
        lucroPotencialEstoqueEl.textContent = formatarMoeda(lucroPotencialTotal);
        lucroPotencialEstoqueEl.classList.toggle('text-profit', lucroPotencialTotal >= 0);
        lucroPotencialEstoqueEl.classList.toggle('text-loss', lucroPotencialTotal < 0);
        qtdPecasEstoqueEl.textContent = pecasEmEstoque.length;
    }

    formNovaPeca.addEventListener('submit', async (event) => {
        event.preventDefault();

        const nomePeca = document.getElementById('nomePeca').value.trim();
        const quantidade = parseInt(document.getElementById('quantidade').value) || 1;
        const precoCompraUnitario = parseFloat(document.getElementById('precoCompra').value);
        const precoVenda = parseFloat(document.getElementById('precoVenda').value);
        const corPeca = document.getElementById('corPeca').value.trim();
        const tamanhoPeca = document.getElementById('tamanhoPeca').value.trim(); // Obter tamanho
        const diaCompra = document.getElementById('diaCompra').value;
        const mesCompra = document.getElementById('mesCompra').value;

        if (!nomePeca || isNaN(precoCompraUnitario) || isNaN(precoVenda)) {
            showNotificationModal('Erro de Validação', 'Por favor, preencha os campos obrigatórios: Nome da Peça, Preço de Compra e Preço de Venda.');
            return;
        }
        if (precoCompraUnitario < 0 || precoVenda < 0 || quantidade < 1) {
            showNotificationModal('Erro de Validação', 'Os preços de compra e venda não podem ser negativos.');
            return;
        }

        if (!diaCompra || !mesCompra || parseInt(diaCompra) < 1 || parseInt(diaCompra) > 31 || parseInt(mesCompra) < 1 || parseInt(mesCompra) > 12) {
            showNotificationModal('Erro de Validação', 'Por favor, insira um dia e mês válidos para a data da compra.');
            return;
        }
        const anoAtual = new Date().getFullYear();
        const dataCompraFormatada = `${anoAtual}-${String(mesCompra).padStart(2, '0')}-${String(diaCompra).padStart(2, '0')}`;

        const novaPeca = {
        id: Date.now(),
        nome: nomePeca,
        quantidade: quantidade,
        preco_comprado_unitario: precoCompraUnitario,
        preco_venda: precoVenda,
        cor: corPeca,
        tamanho: tamanhoPeca,
        data_compra: dataCompraFormatada,
        status: 'estoque',
        data_venda: null
};

        const pecaSalva = await addPecaAPI(novaPeca); // Chama a função API
        if (pecaSalva) { // Verifica se a operação foi bem-sucedida
            await inicializarPagina(); // Recarrega os dados e renderiza
            showNotificationModal('Sucesso', `Peça "${pecaSalva.nome}" adicionada!`);
        }
        formNovaPeca.reset();
        document.getElementById('nomePeca').focus();
    });


    function abrirModalVendaComQuantidade(peca) {
        const onConfirm = (pecaId, quantidadeVendida) => {
            // Lê o valor do desconto diretamente do input no momento da confirmação
            const descontoInput = document.getElementById('sellDesconto');
            const descontoAplicado = descontoInput ? parseFloat(descontoInput.value) || 0 : 0;
            
            // Chama a função que processa a venda com todos os dados necessários
            processarVenda(pecaId, quantidadeVendida, descontoAplicado);
        };

        showSellQuantityModal(
            'Registrar Venda',
            peca,
            onConfirm
        );
    const quantidadeInput = document.getElementById('sellQuantidade');
        const descontoInput = document.getElementById('sellDesconto');

        if (quantidadeInput && descontoInput) {
            // Para evitar que múltiplos listeners sejam adicionados em reutilizações do modal,
            // uma abordagem é clonar o elemento para remover listeners antigos.
            const newQuantidadeInput = quantidadeInput.cloneNode(true);
            quantidadeInput.parentNode.replaceChild(newQuantidadeInput, quantidadeInput);
            
            const newDescontoInput = descontoInput.cloneNode(true);
            descontoInput.parentNode.replaceChild(newDescontoInput, descontoInput);

            // Adiciona os novos listeners aos elementos clonados
            newQuantidadeInput.addEventListener('input', () => atualizarPrecoVenda(peca));
            newDescontoInput.addEventListener('input', () => atualizarPrecoVenda(peca));
            
            // Dispara o cálculo uma vez para exibir os valores iniciais corretamente
            atualizarPrecoVenda(peca);
        }
    }

    async function processarVenda(pecaOriginalId, quantidadeVendida, descontoAplicado) {
        const pecaOriginal = todasAsPecas.find(p => p.id === pecaOriginalId);
        if (!pecaOriginal) {
            showNotificationModal('Erro', 'Peça original não encontrada.');
             return;
        }

        if (isNaN(quantidadeVendida) || quantidadeVendida <= 0 || quantidadeVendida > pecaOriginal.quantidade) {
            showNotificationModal('Erro de Validação', `Quantidade de venda inválida. Deve ser entre 1 e ${pecaOriginal.quantidade}.`);
            return;
        }

        if (isNaN(descontoAplicado) || descontoAplicado < 0 || descontoAplicado > 100) {
            showNotificationModal('Erro de Validação', 'O valor do desconto deve ser entre 0 e 100.');
            return;
        }

        let operacaoBemSucedida = false;

        const precoVendaOriginal = parseFloat(pecaOriginal.preco_venda); // CORRETO!
        const precoCompraUnitario = parseFloat(pecaOriginal.preco_comprado_unitario); // CORRETO!
        const precoVendaFinalUnitario = precoVendaOriginal * (1 - (descontoAplicado / 100));
        const lucroPorPeca = precoVendaFinalUnitario - precoCompraUnitario;

        if (quantidadeVendida < pecaOriginal.quantidade) {
            // Venda parcial: atualizar original e criar nova peça vendida
            const lucroTotalVenda = lucroPorPeca * quantidadeVendida;

            const pecaOriginalAtualizada = {
                quantidade: pecaOriginal.quantidade - quantidadeVendida,
                compra: pecaOriginal.precoCompraUnitario * (pecaOriginal.quantidade - quantidadeVendida)
            };

            const novaPecaVendida = {
                id: Date.now(),
                nome: pecaOriginal.nome,
                cor: pecaOriginal.cor,
                tamanho: pecaOriginal.tamanho,
                quantidade: quantidadeVendida,
                preco_comprado_unitario: pecaOriginal.preco_comprado_unitario,
                preco_venda: precoVendaFinalUnitario,
                data_compra: pecaOriginal.data_compra,
                status: 'vendida',
                data_venda: getDataAtualYYYYMMDD(),
                desconto: descontoAplicado,
                lucro: lucroTotalVenda
            };

            const updateResult = await updatePecaAPI(pecaOriginal.id, pecaOriginalAtualizada);
            if (updateResult) {
                const addResult = await addPecaAPI(novaPecaVendida);
                if (addResult) {
                    operacaoBemSucedida = true;
                    showNotificationModal('Sucesso', `${quantidadeVendida} unidade(s) de "${pecaOriginal.nome}" vendida(s). Estoque atualizado.`);
                } else {
                    showNotificationModal('Erro Crítico', 'Venda parcial não pôde ser registrada completamente. Verifique os dados.');
                }
            } else {
                showNotificationModal('Erro', 'Não foi possível atualizar a peça original no estoque.');
            }
        } else { // quantidadeVendida === pecaOriginal.quantidade
            // Venda total da peça em estoque

            const lucroTotalVenda = lucroPorPeca * pecaOriginal.quantidade;
            const updates = {
                status: 'vendida',
                data_venda: getDataAtualYYYYMMDD(), // Use o formato correto!
                preco_venda: precoVendaFinalUnitario,
                lucro: lucroTotalVenda,
                desconto: descontoAplicado
            };
            const resultadoUpdate = await updatePecaAPI(pecaOriginal.id, updates);
            if (resultadoUpdate) {
                operacaoBemSucedida = true;
                showNotificationModal('Sucesso', `Peça "${pecaOriginal.nome}" (${pecaOriginal.quantidade} un.) marcada como vendida.`);
            }
        }

        if (operacaoBemSucedida) {
            await inicializarPagina();
        }
    }

    // Função para vender múltiplos itens selecionados (vende a quantidade total de cada)
    async function marcarComoVendidaEmLote(idsParaVender) {
        const updates = { status: 'vendida', dataVenda: getDataAtualMMDD() };

        const resultado = await batchUpdatePecasAPI(idsParaVender, updates);
        if (resultado) {
            await inicializarPagina();
            showNotificationModal('Sucesso', resultado.message || `${idsParaVender.length} peça(s) marcada(s) como vendida(s).`);
        }
        
        selectAllCheckbox.checked = false; // Desmarcar "Selecionar Todos"
    }

    

    function editarPeca(pecaId) {
        const pecaParaEditar = todasAsPecas.find(p => p.id === pecaId);
        if (!pecaParaEditar) {
            showNotificationModal('Erro', 'Peça não encontrada para edição.');
            return;
        }

        showEditModal('Editar Peça', pecaParaEditar, async (dadosEditados) => {
            // Validação dos dados editados
            if (!dadosEditados.nome || isNaN(dadosEditados.preco_comprado_unitario) || isNaN(dadosEditados.preco_venda) || isNaN(dadosEditados.quantidade)) {
                showNotificationModal('Erro de Validação', 'Nome da Peça, Preço de Compra e Preço de Venda são obrigatórios.');
                return;
            }
            if (dadosEditados.preco_comprado_unitario < 0 || dadosEditados.preco_venda < 0 || dadosEditados.quantidade < 1) {
                showNotificationModal('Erro de Validação', 'Os preços não podem ser negativos.');
                return;
            }

            // Remove campos extras que não existem na tabela do Supabase
            delete dadosEditados.compra;
            delete dadosEditados._id;

            // Garante que status e data_venda existam (se sua tabela exige)
            if (!dadosEditados.status) dadosEditados.status = 'estoque';
            if (!dadosEditados.data_venda) dadosEditados.data_venda = null;

            const resultado = await updatePecaAPI(dadosEditados.id, dadosEditados);
            if (resultado) {
                await inicializarPagina();
                showNotificationModal('Sucesso', `Peça "${dadosEditados.nome}" atualizada com sucesso!`);
            }
        });
    }

     function deletarPecaComConfirmacao(pecaId, pecaNome) {
        showConfirmationModal(
            'Confirmar Exclusão',
            `Tem certeza que deseja deletar a peça "${pecaNome}" do estoque? Esta ação não pode ser desfeita.`,
            () => {
                deletarPecas([pecaId]);
            }
        );
    }

    async function deletarPecas(idsParaDeletar) {
        const resultado = await batchUpdatePecasAPI(idsParaDeletar, null, 'delete');
        if (resultado) {
            await inicializarPagina();
            // A mensagem de sucesso já é mostrada por batchUpdatePecasAPI em caso de erro,
            // ou podemos usar a mensagem do backend se disponível.
            showNotificationModal('Sucesso', resultado.message || `${idsParaDeletar.length} peça(s) deletada(s).`);
        }
        selectAllCheckbox.checked = false; // Desmarcar "Selecionar Todos"
    }

    selectAllCheckbox.addEventListener('change', (event) => {
        document.querySelectorAll('.peca-checkbox').forEach(checkbox => {
            checkbox.checked = event.target.checked;
        });
    });

    btnVenderSelecionados.addEventListener('click', async () => {
        const idsSelecionados = getSelectedPecaIds();
        if (idsSelecionados.length === 0) {
            showNotificationModal('Atenção', "Nenhuma peça selecionada para vender.");
            return;
        }
        showConfirmationModal(
            'Confirmar Venda em Massa',
            `Tem certeza que deseja marcar ${idsSelecionados.length} peça(s) selecionada(s) como vendida(s)?`,
            () => marcarComoVendidaEmLote(idsSelecionados)
        );
    });

    btnDeletarSelecionados.addEventListener('click', async () => {
        const idsSelecionados = getSelectedPecaIds();
        if (idsSelecionados.length === 0) {
            showNotificationModal('Atenção', "Nenhuma peça selecionada para deletar.");
            return;
        }
        showConfirmationModal(
            'Confirmar Exclusão em Massa',
            `Tem certeza que deseja excluir ${idsSelecionados.length} peça(s) selecionada(s)? Esta ação não pode ser desfeita.`,
            () => deletarPecas(idsSelecionados)
        );
    });

    // Adicionar event listener para a barra de pesquisa
    if (searchInputEstoque) {
        searchInputEstoque.addEventListener('input', () => {
            renderizarTabelaEstoque(); // Re-renderiza a tabela aplicando o filtro
            // O resumo do estoque não é afetado pelo filtro de visualização
        });
    }

    if(btnDeletarSelecionados) btnDeletarSelecionados.classList.add('btn-delete');

    // Função assíncrona para inicializar a página
    async function inicializarPagina() {
        todasAsPecas = await carregarPecas(); // Carrega as peças do backend
        renderizarTabelaEstoque();
        atualizarResumoEstoque(); // O resumo sempre reflete o total, não o filtrado
    }

    await inicializarPagina();

    function getDataAtualYYYYMMDD() {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
});