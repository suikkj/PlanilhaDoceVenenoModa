// js/index_script.js
document.addEventListener('DOMContentLoaded', async () => {
    const totalGastoGeralEl = document.getElementById('totalGastoGeral');
    const lucroTotalVendasEl = document.getElementById('lucroTotalVendas');
    const tabelaVendasRecentesBody = document.getElementById('tabelaVendasRecentes').getElementsByTagName('tbody')[0];
    const tabelaHistoricoMensalBody = document.getElementById('tabelaHistoricoMensal').getElementsByTagName('tbody')[0];    
    let todasAsPecas = [];
 
    // Verifica se o usuário está logado. Se não, redireciona e para a execução do script.
    if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    function atualizarResumoPrincipal() {
        let totalGasto = 0;
        let lucroRealizado = 0;

        todasAsPecas.forEach(peca => {
            // CORREÇÃO: Usar nomes de colunas do Supabase e multiplicar pela quantidade
            totalGasto += (peca.preco_comprado_unitario || 0) * peca.quantidade;
            if (peca.status === 'vendida') {
                const custo = (peca.preco_comprado_unitario || 0) * peca.quantidade;
                const receita = (peca.preco_venda || 0) * peca.quantidade;
                lucroRealizado += receita - custo;
            }
        });

        totalGastoGeralEl.textContent = formatarMoeda(totalGasto);
        lucroTotalVendasEl.textContent = formatarMoeda(lucroRealizado);
        lucroTotalVendasEl.classList.toggle('text-profit', lucroRealizado >= 0);
        lucroTotalVendasEl.classList.toggle('text-loss', lucroRealizado < 0);
    }

    function renderizarVendasRecentes() {
        tabelaVendasRecentesBody.innerHTML = '';
        const pecasVendidas = todasAsPecas
            .filter(peca => peca.status === 'vendida' && peca.data_venda) // CORREÇÃO: data_venda
            .sort((a, b) => {
                // CORREÇÃO: Lógica de ordenação para datas YYYY-MM-DD
                return new Date(b.data_venda) - new Date(a.data_venda); // Mais recentes primeiro
            });

        const limiteVendasRecentes = 5; // Mostrar as últimas 5 vendas

        if (pecasVendidas.length === 0) {
            const tr = tabelaVendasRecentesBody.insertRow();
            const td = tr.insertCell();
            td.setAttribute('colspan', '4');
            td.textContent = 'Nenhuma venda registrada ainda.';
            td.style.textAlign = 'center';
            return;
        }

        pecasVendidas.slice(0, limiteVendasRecentes).forEach(peca => {
            const tr = tabelaVendasRecentesBody.insertRow();
            // CORREÇÃO: Usar nomes de colunas do Supabase
            const custo = (peca.preco_comprado_unitario || 0) * peca.quantidade;
            const receita = (peca.preco_venda || 0) * peca.quantidade;
            const lucroDaVenda = receita - custo;

            tr.insertCell().textContent = peca.nome;
            tr.insertCell().textContent = formatarData(peca.data_venda); // CORREÇÃO
            
            const precoVendaTd = tr.insertCell();
            precoVendaTd.textContent = formatarMoeda(receita); // CORREÇÃO: receita total
            precoVendaTd.classList.add('currency');
            
            const lucroVendaTd = tr.insertCell();
            lucroVendaTd.textContent = formatarMoeda(lucroDaVenda);
            lucroVendaTd.classList.add('currency');
            lucroVendaTd.classList.toggle('text-profit', lucroDaVenda >= 0);
            lucroVendaTd.classList.toggle('text-loss', lucroDaVenda < 0);
        });
    }

    async function processarFechamentoMensal() {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1; // 1-12

        // Define o início do período (Maio de 2025)
        const anoInicio = 2025;
        const mesInicio = 5; // Maio

        let historicoMensal = await carregarHistoricoMensalAPI();

        for (let ano = anoInicio; ano <= anoAtual; ano++) {
            let mesLimiteLoop = (ano === anoAtual) ? mesAtual -1 : 12; // Processa até o mês anterior ao atual
            if (ano < anoAtual) mesLimiteLoop = 12;

            for (let mes = (ano === anoInicio ? mesInicio : 1); mes <= mesLimiteLoop; mes++) {

                const mesAnoStr = `${String(mes).padStart(2, '0')}/${ano}`;
                
                // CORREÇÃO: Usar 'mes_ano' que vem do Supabase
                if (!historicoMensal.find(h => h.mes_ano === mesAnoStr)) {
                    let faturamento = 0;
                    let lucro = 0;
                    let pecas_vendidas = 0;

                    todasAsPecas.forEach(peca => {
                        // CORREÇÃO: Usar data_venda e nomes de colunas do Supabase
                        if (peca.status === 'vendida' && peca.data_venda) {
                            const dataVenda = new Date(peca.data_venda);
                            if (dataVenda.getFullYear() === ano && (dataVenda.getMonth() + 1) === mes) {
                                const custo = (peca.preco_comprado_unitario || 0) * peca.quantidade;
                                const receita = (peca.preco_venda || 0) * peca.quantidade;
                                faturamento += receita;
                                lucro += (receita - custo);
                                pecas_vendidas += peca.quantidade;
                            }
                        }
                    });

                    if (faturamento > 0) { // Só adiciona se houve movimento
                        historicoMensal.push({
                            mes_ano: mesAnoStr,
                            faturamento: faturamento,
                            lucro: lucro,
                            pecas_vendidas: pecas_vendidas
                        });
                    }
                }
            }
        }
        await salvarHistoricoMensalAPI(historicoMensal);
        return historicoMensal;
    }

    function renderizarHistoricoMensal(historicoParaRenderizar) {
        tabelaHistoricoMensalBody.innerHTML = '';

        // Ordena o histórico para exibição (mais recente primeiro, opcional)
        const historicoOrdenado = [...historicoParaRenderizar].sort((a, b) => {
            const [mesA, anoA] = a.mes_ano.split('/'); // CORREÇÃO
            const [mesB, anoB] = b.mes_ano.split('/'); // CORREÇÃO
            return new Date(anoB, mesB - 1) - new Date(anoA, mesA - 1);
        });

        if (historicoOrdenado.length === 0) {
            const tr = tabelaHistoricoMensalBody.insertRow();
            const td = tr.insertCell();
            td.setAttribute('colspan', '4');
            td.textContent = 'Nenhum histórico mensal para exibir.';
            td.style.textAlign = 'center';
            return;
        }

        historicoOrdenado.forEach(item => {
            const tr = tabelaHistoricoMensalBody.insertRow();
            tr.insertCell().textContent = item.mes_ano; // CORREÇÃO
            
            const vendasTd = tr.insertCell();
            vendasTd.textContent = formatarMoeda(item.faturamento); // CORREÇÃO
            vendasTd.classList.add('currency');

            const gastosTd = tr.insertCell();
            // O CMV é a diferença entre faturamento e lucro
            gastosTd.textContent = formatarMoeda(item.faturamento - item.lucro); // CORREÇÃO
            gastosTd.classList.add('currency');

            const lucroTd = tr.insertCell();
            lucroTd.textContent = formatarMoeda(item.lucro);
            lucroTd.classList.add('currency');
            lucroTd.classList.toggle('text-profit', item.lucro >= 0);
            lucroTd.classList.toggle('text-loss', item.lucro < 0);
        });
    }

    async function inicializarPagina() {
        todasAsPecas = await carregarPecas(); // Carrega as peças do backend

        atualizarResumoPrincipal();
        renderizarVendasRecentes();
        const historicoProcessadoESalvo = await processarFechamentoMensal(); // Processa, salva e retorna o histórico
        renderizarHistoricoMensal(historicoProcessadoESalvo); // Renderiza o histórico (após processar e salvar)
    }

    await inicializarPagina();
});