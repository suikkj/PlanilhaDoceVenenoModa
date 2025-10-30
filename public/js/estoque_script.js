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
    const searchInputEstoque = document.getElementById('searchInputEstoque');
    const downloadBtn = document.getElementById('download-excel-btn');
    
    // --- INÍCIO: Novos elementos do formulário de tags ---
    const corPecaSelect = document.getElementById('corPecaSelect');
    const corPecaTagContainer = document.getElementById('corPecaTagContainer');
    const corPecaInput = document.getElementById('corPeca'); // O input hidden
    
    const tamanhoPecaSelect = document.getElementById('tamanhoPecaSelect');
    const tamanhoPecaTagContainer = document.getElementById('tamanhoPecaTagContainer');
    const tamanhoPecaInput = document.getElementById('tamanhoPeca'); // O input hidden
    // --- FIM: Novos elementos do formulário de tags ---
    
    let todasAsPecas = [];
    let currentSellModalHandler = null;
 
    if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    // --- INÍCIO: Lógica de Tags do Formulário ---

    /**
     * Gerencia a adição e remoção de tags para um campo de formulário.
     * @param {HTMLSelectElement} selectElement - O <select> que dispara a adição.
     * @param {HTMLDivElement} tagContainer - O <div> que exibe as tags.
     * @param {HTMLInputElement} hiddenInput - O <input type="hidden"> que armazena os dados.
     */
    function setupTagInput(selectElement, tagContainer, hiddenInput) {
        
        // Função para atualizar o input hidden com base nas tags visíveis
        function updateHiddenInput() {
            const tags = tagContainer.querySelectorAll('.tag');
            const tagValues = Array.from(tags).map(tag => tag.dataset.value);
            hiddenInput.value = tagValues.join(', ');
        }

        // Função para criar uma tag visual
        function createTag(value) {
            // Opcional: Evitar duplicatas (descomente se preferir)
            /*
            const existingTags = Array.from(tagContainer.querySelectorAll('.tag')).map(t => t.dataset.value);
            if (existingTags.includes(value)) {
                return; // Não adiciona se já existir
            }
            */
            
            const tag = document.createElement('div');
            tag.classList.add('tag');
            tag.dataset.value = value;
            
            const tagText = document.createElement('span');
            tagText.textContent = value;
            
            const removeBtn = document.createElement('span');
            removeBtn.classList.add('remove-tag');
            removeBtn.textContent = 'x';
            removeBtn.onclick = () => {
                tag.remove();
                updateHiddenInput();
            };
            
            tag.appendChild(tagText);
            tag.appendChild(removeBtn);
            tagContainer.appendChild(tag);
            updateHiddenInput();
        }

        // Event listener para o <select>
        selectElement.addEventListener('change', () => {
            const selectedValue = selectElement.value;
            if (selectedValue) {
                // Adiciona a tag
                createTag(selectedValue);
                // Reseta o select para a opção padrão
                selectElement.value = '';
            }
        });

        // Permite limpar o container (usado no reset do form)
        tagContainer.clear = () => {
            tagContainer.innerHTML = '';
            updateHiddenInput();
        };
    }

    // Excel

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            // A variável 'todasAsPecas' já está disponível neste escopo
            exportarDadosParaExcel(todasAsPecas);
        });
    }

    // Inicializa os gerenciadores de tags
    if (corPecaSelect) {
        setupTagInput(corPecaSelect, corPecaTagContainer, corPecaInput);
        setupTagInput(tamanhoPecaSelect, tamanhoPecaTagContainer, tamanhoPecaInput);
    }
    // --- FIM: Lógica de Tags do Formulário ---


    function atualizarPrecoVenda(peca) {
        // ... (função sem alterações) ...
        const quantidadeInput = document.getElementById('sellQuantidade');
        const descontoInput = document.getElementById('sellDesconto');
        const precoFinalSpan = document.getElementById('sellPrecoFinal');
        const totalVendaSpan = document.getElementById('sellTotalVenda');

        if (!quantidadeInput || !descontoInput || !precoFinalSpan || !totalVendaSpan) {
            return;
        }

        const quantidade = parseInt(quantidadeInput.value, 10) || 0;
        const desconto = parseFloat(descontoInput.value) || 0;
                const precoVendaOriginal = parseFloat(peca.preco_venda);

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
        // ... (função sem alterações) ...
        const selectedIds = [];
        document.querySelectorAll('.peca-checkbox:checked').forEach(checkbox => {
            selectedIds.push(parseInt(checkbox.dataset.id));
        });
        return selectedIds;
    }

    function renderizarTabelaEstoque() {
        // ... (função sem alterações) ...
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

        pecasFiltradas.sort((a, b) => a.nome.localeCompare(b.nome));

        if (pecasFiltradas.length === 0) {
            const tr = tabelaEstoqueBody.insertRow();
            const td = tr.insertCell();
            td.setAttribute('colspan', '10');
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
            const lucroPotencial = (peca.preco_venda * peca.quantidade) - (peca.preco_comprado_unitario * peca.quantidade);

            const checkboxTd = tr.insertCell();
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('peca-checkbox');
            checkbox.dataset.id = peca.id;
            checkboxTd.appendChild(checkbox);

            tr.insertCell().textContent = peca.nome;
            tr.insertCell().textContent = peca.cor || '-';
            tr.insertCell().textContent = peca.tamanho || '-';
            tr.insertCell().textContent = peca.quantidade;
            const dataCompraTd = tr.insertCell();
            dataCompraTd.textContent = formatarData(peca.data_compra);        

            const precoCompraTd = tr.insertCell();
            precoCompraTd.textContent = formatarMoeda(peca.preco_comprado_unitario);

            const precoVendaTd = tr.insertCell();
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
            btnEditar.onclick = () => editarPeca(peca.id);
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
        // ... (função sem alterações) ...
        const pecasEmEstoque = todasAsPecas.filter(p => p.status === 'estoque');
        const totalInvestido = pecasEmEstoque.reduce((acc, p) => acc + (p.preco_comprado_unitario * p.quantidade), 0);
        const lucroPotencialTotal = pecasEmEstoque.reduce((acc, p) => acc + ((p.preco_venda * p.quantidade) - (p.preco_comprado_unitario * p.quantidade)), 0);

        totalInvestidoEstoqueEl.textContent = formatarMoeda(totalInvestido);
        lucroPotencialEstoqueEl.textContent = formatarMoeda(lucroPotencialTotal);
        lucroPotencialEstoqueEl.classList.toggle('text-profit', lucroPotencialTotal >= 0);
        lucroPotencialEstoqueEl.classList.toggle('text-loss', lucroPotencialTotal < 0);
        qtdPecasEstoqueEl.textContent = pecasEmEstoque.length;
    }

    // --- ATUALIZAÇÃO: Listener de Submit do Formulário ---
    formNovaPeca.addEventListener('submit', async (event) => {
        event.preventDefault();

        const nomePeca = document.getElementById('nomePeca').value.trim();
        const quantidade = parseInt(document.getElementById('quantidade').value) || 1;
        const precoCompraUnitario = parseFloat(document.getElementById('precoCompra').value);
        const precoVenda = parseFloat(document.getElementById('precoVenda').value);
        
        // --- MODIFICADO ---
        // Os valores agora vêm dos inputs hidden, que são atualizados pela função setupTagInput
        const corPeca = document.getElementById('corPeca').value.trim();
        const tamanhoPeca = document.getElementById('tamanhoPeca').value.trim(); 
        // --- FIM DA MODIFICAÇÃO ---

        const diaCompra = document.getElementById('diaCompra').value;
        const mesCompra = document.getElementById('mesCompra').value;

        if (!nomePeca || isNaN(precoCompraUnitario) || isNaN(precoVenda)) {
            showNotificationModal('Erro de Validação', 'Por favor, preencha os campos obrigatórios: Nome da Peça, Preço de Compra e Preço de Venda.');
            return;
        }
        if (precoCompraUnitario < 0 || precoVenda < 0 || quantidade < 1) {
            showNotificationModal('Erro de Validação', 'Os preços não podem ser negativos.');
            return;
        }

        // --- INÍCIO: Validação de Quantidade vs Tags ---
        const corTags = corPeca ? corPeca.split(',').map(t => t.trim()) : [];
        const tamanhoTags = tamanhoPeca ? tamanhoPeca.split(',').map(t => t.trim()) : [];
        
        let finalCores = corPeca;
        let finalTamanhos = tamanhoPeca;

        if (quantidade > 1) {
            // Se adicionou UMA cor, replica para todas as unidades
            if (corTags.length === 1) {
                finalCores = Array(quantidade).fill(corTags[0]).join(', ');
            } 
            // Se adicionou várias cores, o número deve bater
            else if (corTags.length > 0 && corTags.length !== quantidade) {
                showNotificationModal('Erro de Validação', `A quantidade de tags de COR (${corTags.length}) não bate com a Quantidade de peças (${quantidade}). Adicione 1 tag (para replicar) ou ${quantidade} tags.`);
                return;
            }

            // Se adicionou UM tamanho, replica para todas as unidades
            if (tamanhoTags.length === 1) {
                finalTamanhos = Array(quantidade).fill(tamanhoTags[0]).join(', ');
            }
            // Se adicionou vários tamanhos, o número deve bater
            else if (tamanhoTags.length > 0 && tamanhoTags.length !== quantidade) {
                showNotificationModal('Erro de Validação', `A quantidade de tags de TAMANHO (${tamanhoTags.length}) não bate com a Quantidade de peças (${quantidade}). Adicione 1 tag (para replicar) ou ${quantidade} tags.`);
                return;
            }
        }
        // --- FIM: Validação de Quantidade vs Tags ---


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
            // --- MODIFICADO ---
            cor: finalCores,
            tamanho: finalTamanhos,
            // --- FIM DA MODIFICAÇÃO ---
            data_compra: dataCompraFormatada,
            status: 'estoque',
            data_venda: null
        };

        const pecaSalva = await addPecaAPI(novaPeca);
        if (pecaSalva) {
            await inicializarPagina();
            showNotificationModal('Sucesso', `Peça "${pecaSalva.nome}" adicionada!`);
        }
        
        // --- INÍCIO: Limpar containers de tags ---
        corPecaTagContainer.clear();
        tamanhoPecaTagContainer.clear();
        // --- FIM: Limpar containers de tags ---
        
        formNovaPeca.reset();
        document.getElementById('nomePeca').focus();
    });


    function abrirModalVendaComQuantidade(peca) {
        // ... (função onConfirm sem alterações) ...
        const onConfirm = (pecaId, quantidadeVendida) => {
            const descontoInput = document.getElementById('sellDesconto');
            const descontoAplicado = descontoInput ? parseFloat(descontoInput.value) || 0 : 0;
            
            const corVendida = document.getElementById('sellCorVendida').value;
            const tamanhoVendido = document.getElementById('sellTamanhoVendido').value;

            const hasCores = document.getElementById('sellCoresContainer').children.length > 0;
            if (hasCores && !corVendida) {
                showNotificationModal('Validação', 'Por favor, selecione uma cor para vender.');
                return;
            }

            const hasTamanhos = document.getElementById('sellTamanhosContainer').children.length > 0;
            if (hasTamanhos && !tamanhoVendido) {
                showNotificationModal('Validação', 'Por favor, selecione um tamanho para vender.');
                return;
            }
            
            processarVenda(pecaId, quantidadeVendida, corVendida, tamanhoVendido, descontoAplicado);
        };

        showSellQuantityModal(
            'Registrar Venda',
            peca,
            onConfirm
        );
        
        const sellCoresContainer = document.getElementById('sellCoresContainer');
        const sellTamanhosContainer = document.getElementById('sellTamanhosContainer');
        const sellCorVendidaInput = document.getElementById('sellCorVendida');
        const sellTamanhoVendidoInput = document.getElementById('sellTamanhoVendido');

        sellCoresContainer.innerHTML = '';
        sellTamanhosContainer.innerHTML = '';
        sellCorVendidaInput.value = '';
        sellTamanhoVendidoInput.value = '';

        // --- ATUALIZAÇÃO: Função populateTags (Modal de Venda) ---
        const populateTags = (container, input, tagsString) => {
            const parentElement = container.parentElement;

            if (!tagsString || tagsString.trim() === '') {
                if (parentElement) parentElement.style.display = 'none';
                return;
            }
            
            const tags = tagsString.split(',').map(t => t.trim()).filter(t => t);

            if (tags.length === 0) {
                 if (parentElement) parentElement.style.display = 'none';
                return;
            }

            if (parentElement) parentElement.style.display = 'block';

            tags.forEach(tagText => {
                const tagEl = document.createElement('div');
                tagEl.classList.add('tag');
                tagEl.textContent = tagText;
                tagEl.dataset.value = tagText;

                tagEl.addEventListener('click', () => {
                    // --- MODIFICAÇÃO INÍCIO (Lógica de Toggle) ---
                    
                    // Verifica se a tag clicada JÁ ESTÁ selecionada
                    const isAlreadySelected = tagEl.classList.contains('selected');

                    // Desmarca todas as tags no container
                    const allTagsInContainer = container.querySelectorAll('.tag');
                    allTagsInContainer.forEach(t => t.classList.remove('selected'));

                    if (isAlreadySelected) {
                        // Se já estava selecionada, apenas desmarca (já foi feito acima)
                        // E limpa o input hidden
                        input.value = '';
                    } else {
                        // Se não estava selecionada, marca a tag clicada
                        tagEl.classList.add('selected');
                        // E atualiza o input hidden
                        input.value = tagText;
                    }
                    // --- MODIFICAÇÃO FIM ---
                });
                container.appendChild(tagEl);
            });
        };
        // --- FIM DA ATUALIZAÇÃO ---

        populateTags(sellCoresContainer, sellCorVendidaInput, peca.cor);
        populateTags(sellTamanhosContainer, sellTamanhoVendidoInput, peca.tamanho);


        const quantidadeInput = document.getElementById('sellQuantidade');
        const descontoInput = document.getElementById('sellDesconto');

        if (quantidadeInput && descontoInput) {
            if (currentSellModalHandler) {
                quantidadeInput.removeEventListener('input', currentSellModalHandler);
                descontoInput.removeEventListener('input', currentSellModalHandler);
            }
            currentSellModalHandler = () => atualizarPrecoVenda(peca);
            quantidadeInput.addEventListener('input', currentSellModalHandler);
            descontoInput.addEventListener('input', currentSellModalHandler);
            atualizarPrecoVenda(peca);
        }
    }

    async function processarVenda(pecaOriginalId, quantidadeVendida, corVendida, tamanhoVendido, descontoAplicado) {
        // ... (função sem alterações) ...
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

        const removeTag = (tagsString, tagToRemove) => {
            if (!tagsString || !tagToRemove) return tagsString;
            const tags = tagsString.split(',').map(t => t.trim());
            const index = tags.indexOf(tagToRemove);
            if (index > -1) {
                tags.splice(index, 1);
            }
            return tags.join(', ');
        };

        let operacaoBemSucedida = false;

        const precoVendaOriginal = parseFloat(pecaOriginal.preco_venda);
        const precoCompraUnitario = parseFloat(pecaOriginal.preco_comprado_unitario);
        const precoVendaFinalUnitario = precoVendaOriginal * (1 - (descontoAplicado / 100));
        const lucroPorPeca = precoVendaFinalUnitario - precoCompraUnitario;

        const hasTags = corVendida || tamanhoVendido;

        if (hasTags && quantidadeVendida > 1) {
            showNotificationModal('Atenção', 'A venda com seleção de cor/tamanho só permite a baixa de 1 unidade por vez. A quantidade foi ajustada para 1.');
            quantidadeVendida = 1;
        }

        const novaQuantidade = pecaOriginal.quantidade - quantidadeVendida;
        const lucroTotalVenda = lucroPorPeca * quantidadeVendida;

        if (novaQuantidade > 0) {
            const pecaOriginalAtualizada = {
                quantidade: novaQuantidade,
                cor: hasTags ? removeTag(pecaOriginal.cor, corVendida) : pecaOriginal.cor,
                tamanho: hasTags ? removeTag(pecaOriginal.tamanho, tamanhoVendido) : pecaOriginal.tamanho,
            };

            const novaPecaVendida = {
                nome: pecaOriginal.nome,
                cor: corVendida,
                tamanho: tamanhoVendido,
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
                    const vendido = hasTags ? `1 unidade de "${pecaOriginal.nome}" (${tamanhoVendido || ''}/${corVendida || ''})` : `${quantidadeVendida} unidade(s) de "${pecaOriginal.nome}"`;
                    showNotificationModal('Sucesso', `${vendido} vendida(s). Estoque atualizado.`);
                } else {
                    showNotificationModal('Erro Crítico', 'A peça em estoque foi atualizada, mas a peça vendida não pôde ser registrada. Verifique os dados.');
                }
            } else {
                showNotificationModal('Erro', 'Não foi possível atualizar a peça original no estoque.');
            }
        } else {
            const updates = {
                status: 'vendida',
                data_venda: getDataAtualYYYYMMDD(),
                preco_venda: precoVendaFinalUnitario,
                lucro: lucroTotalVenda,
                desconto: descontoAplicado,
                cor: hasTags ? corVendida : pecaOriginal.cor,
                tamanho: hasTags ? tamanhoVendido : pecaOriginal.tamanho,
            };
            const resultadoUpdate = await updatePecaAPI(pecaOriginal.id, updates);
            if (resultadoUpdate) {
                operacaoBemSucedida = true;
                const vendido = hasTags ? `"${pecaOriginal.nome}" (${tamanhoVendido || ''}/${corVendida || ''})` : `"${pecaOriginal.nome}"`;
                showNotificationModal('Sucesso', `Peça ${vendido} marcada como vendida.`);
            }
        }

        if (operacaoBemSucedida) {
            await inicializarPagina();
        }
    }

    async function marcarComoVendidaEmLote(idsParaVender) {
        // ... (função sem alterações) ...
        const updates = { status: 'vendida', dataVenda: getDataAtualMMDD() };

        const resultado = await batchUpdatePecasAPI(idsParaVender, updates);
        if (resultado) {
            await inicializarPagina();
            showNotificationModal('Sucesso', resultado.message || `${idsParaVender.length} peça(s) marcada(s) como vendida(s).`);
        }
        
        selectAllCheckbox.checked = false;
    }

    function editarPeca(pecaId) {
        // ... (função sem alterações) ...
        const pecaParaEditar = todasAsPecas.find(p => p.id === pecaId);
        if (!pecaParaEditar) {
            showNotificationModal('Erro', 'Peça não encontrada para edição.');
            return;
        }

        showEditModal('Editar Peça', pecaParaEditar, async (dadosEditados) => {
            if (!dadosEditados.nome || isNaN(dadosEditados.preco_comprado_unitario) || isNaN(dadosEditados.preco_venda) || isNaN(dadosEditados.quantidade)) {
                showNotificationModal('Erro de Validação', 'Nome da Peça, Preço de Compra e Preço de Venda são obrigatórios.');
                return;
            }
            if (dadosEditados.preco_comprado_unitario < 0 || dadosEditados.preco_venda < 0 || dadosEditados.quantidade < 1) {
                showNotificationModal('Erro de Validação', 'Os preços não podem ser negativos.');
                return;
            }

            delete dadosEditados.compra;
            delete dadosEditados._id;

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
        // ... (função sem alterações) ...
        showConfirmationModal(
            'Confirmar Exclusão',
            `Tem certeza que deseja deletar a peça "${pecaNome}" do estoque? Esta ação não pode ser desfeita.`,
            () => {
                deletarPecas([pecaId]);
            }
        );
    }

    async function deletarPecas(idsParaDeletar) {
        // ... (função sem alterações) ...
        const resultado = await batchUpdatePecasAPI(idsParaDeletar, null, 'delete');
        if (resultado) {
            await inicializarPagina();
            showNotificationModal('Sucesso', resultado.message || `${idsParaDeletar.length} peça(s) deletada(s).`);
        }
        selectAllCheckbox.checked = false;
    }

    selectAllCheckbox.addEventListener('change', (event) => {
        // ... (função sem alterações) ...
        document.querySelectorAll('.peca-checkbox').forEach(checkbox => {
            checkbox.checked = event.target.checked;
        });
    });

    btnVenderSelecionados.addEventListener('click', async () => {
        // ... (função sem alterações) ...
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
        // ... (função sem alterações) ...
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

    if (searchInputEstoque) {
        // ... (função sem alterações) ...
        searchInputEstoque.addEventListener('input', () => {
            renderizarTabelaEstoque();
        });
    }

    if(btnDeletarSelecionados) btnDeletarSelecionados.classList.add('btn-delete');

    async function inicializarPagina() {
        // ... (função sem alterações) ...
        todasAsPecas = await carregarPecas();
        renderizarTabelaEstoque();
        atualizarResumoEstoque();
    }

    await inicializarPagina();

    function getDataAtualYYYYMMDD() {
        // ... (função sem alterações) ...
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    //  Excel

    

});