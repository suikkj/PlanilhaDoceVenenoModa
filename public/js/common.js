// js/common.js

const HISTORICO_MENSAL_KEY = 'historicoMensalDVModas';
const THEME_STORAGE_KEY = 'themeDVModas';

function getAuthToken() {
    return localStorage.getItem('accessToken');
}

function isUserLoggedIn() {
    return !!getAuthToken();
}

function logoutUser() {
    localStorage.removeItem('accessToken');
    window.location.href = 'login.html';
}

/**
 * Handles API response errors, especially for non-JSON responses and auth issues.
 * @param {Response} response The fetch response object.
 */
async function handleApiError(response) {
    if (response.status === 401 || response.status === 403) {
        logoutUser();
        throw new Error('Acesso não autorizado ou sessão expirada. Você será redirecionado para o login.');
    }

    let errorData;
    try {
        // Try to parse as JSON first, as our API often returns JSON errors for other statuses
        errorData = await response.json();
    } catch (e) {
        // If it's not JSON, use the text body
        const errorText = await response.text();
        errorData = { message: errorText || `Erro HTTP: ${response.status}` };
    }
    throw new Error(errorData.message || `Erro desconhecido com status: ${response.status}`);
}

/**
 * Carrega todas as peças do backend.
 * @returns {Promise<Array>} Promise que resolve para um array de peças.
 */
async function carregarPecas() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos de timeout

    try {
        const response = await fetch(`${API_BASE_URL}/pecas`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` },
            signal: controller.signal // Anexa o sinal do AbortController à requisição
        });
        clearTimeout(timeoutId); // Limpa o timeout se a requisição for concluída

        if (!response.ok) {
            await handleApiError(response);
        }
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId); // Garante que o timeout seja limpo mesmo em caso de erro
        console.error("Erro ao carregar peças do backend:", error);
        const errorMessage = (error.name === 'AbortError')
            ? 'A requisição demorou muito para responder. Verifique sua conexão ou o servidor.'
            : `Erro de conexão de rede. Não foi possível carregar os dados das peças: ${error.message}`;
        showNotificationModal("Erro de Rede", errorMessage);
        return []; // Retorna array vazio em caso de erro para evitar quebras
    }
}

/**
 * Adiciona uma nova peça no backend.
 * @param {object} novaPeca Objeto da nova peça a ser adicionada.
 * @returns {Promise<object|null>}
 */
async function addPecaAPI(novaPeca) {
    try {
        const response = await fetch(`${API_BASE_URL}/pecas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(novaPeca),
        });
        if (!response.ok) {
            await handleApiError(response);
        }
        return await response.json(); // Retorna a peça salva (com _id do MongoDB)
    } catch (error) {
        console.error("Erro ao adicionar peça via API:", error);
        showNotificationModal("Erro ao Salvar", `Não foi possível adicionar a peça: ${error.message}`);
        return null;
    }
}

/**
 * Atualiza uma peça existente no backend.
 * @param {number} pecaId O ID numérico da peça a ser atualizada.
 * @param {object} dadosAtualizados Objeto com os campos a serem atualizados.
 * @returns {Promise<object|null>} Promise que resolve para a resposta da API ou null em caso de erro.
 */
async function updatePecaAPI(pecaId, dadosAtualizados) {
    try {
        const response = await fetch(`${API_BASE_URL}/pecas/${pecaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(dadosAtualizados),
        });
        if (!response.ok) {
            await handleApiError(response);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erro ao atualizar peça ${pecaId} via API:`, error);
        showNotificationModal("Erro ao Atualizar", `Não foi possível atualizar a peça: ${error.message}`);
        return null;
    }
}

/**
 * Carrega o histórico mensal do backend.
 * @returns {Promise<Array>} Promise que resolve para um array de registros mensais.
 */
async function carregarHistoricoMensalAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/historico`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
        if (!response.ok) {
            await handleApiError(response);
        }
        return await response.json();
    } catch (error) {
        console.error("Erro ao carregar histórico mensal do backend:", error);
        showNotificationModal("Erro de Rede", `Não foi possível carregar o histórico mensal: ${error.message}`);
        return []; // Retorna array vazio em caso de erro para evitar quebras
    }
}

/**
 * Deleta uma peça do backend.
 * @param {number} pecaId O ID numérico da peça a ser deletada.
 * @returns {Promise<object|null>} Promise que resolve para a resposta da API ou null em caso de erro.
 */
async function deletePecaAPI(pecaId) {
    try {
        const response = await fetch(`${API_BASE_URL}/pecas/${pecaId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        if (!response.ok) {
            await handleApiError(response);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erro ao deletar peça ${pecaId} via API:`, error);
        showNotificationModal("Erro ao Deletar", `Não foi possível deletar a peça: ${error.message}`);
        return null;
    }
}

/**
 * Realiza operações em lote (atualização ou exclusão) em peças no backend.
 * @param {Array<number>} ids Array de IDs numéricos das peças.
 * @param {object} [updates] Objeto com os campos a serem atualizados (para action='update').
 * @param {string} [action] Ação a ser realizada ('update' ou 'delete').
 * @returns {Promise<object|null>} Promise que resolve para a resposta da API ou null em caso de erro.
 */
async function batchUpdatePecasAPI(ids, updates, action = null) {
    try {
        const payload = { ids, updates };
        if (action) {
            payload.action = action;
        }
        const response = await fetch(`${API_BASE_URL}/pecas/batch`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            await handleApiError(response);
        }
        return await response.json();
    } catch (error) {
        console.error("Erro na operação em lote via API:", error);
        showNotificationModal("Erro na Operação em Lote", `Não foi possível processar a operação em lote: ${error.message}`);
        return null;
    }
}

/**
  * Salva o histórico mensal no backend (substitui o existente).
 * @param {Array} historico Array de registros mensais.
 * @returns {Promise<void>}
 */
async function salvarHistoricoMensalAPI(historico) {
    try {
        const response = await fetch(`${API_BASE_URL}/historico`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(historico),
        });
        if (!response.ok) {
            await handleApiError(response);
        }
        // console.log("Histórico mensal salvo com sucesso no backend.");
    } catch (error) {
        console.error("Erro ao salvar histórico mensal no backend:", error);
        showNotificationModal("Erro ao Salvar", `Não foi possível salvar o histórico mensal: ${error.message}`);
    }
}

/**
 * Formata um valor numérico para o padrão monetário brasileiro (R$ XX,YY).
 * @param {number} valor O valor a ser formatado.
 * @returns {string} O valor formatado como string.
 */
function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) {
        return 'R$ 0,00';
    }
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata uma string de data (YYYY-MM-DD) para o padrão DD/MM/AAAA.
 * @param {string} dataString A data no formato YYYY-MM-DD.
 * @returns {string} A data formatada ou '-' se a entrada for inválida.
 */
function formatarData(dataString) {
    if (!dataString) return '-';
    if (typeof dataString === 'string' && dataString.includes('-')) {
        const partes = dataString.split('-');
        if (partes.length === 2) { // Formato MM-DD
            const [mes, dia] = partes;
            if (mes.length === 2 && dia.length === 2 && !isNaN(parseInt(dia)) && !isNaN(parseInt(mes))) {
                return `${dia}/${mes}/2025`;
            }
        } else if (partes.length === 3) { // Formato YYYY-MM-DD
            // Adiciona T00:00:00 para garantir que a data seja interpretada corretamente
            const dataObj = new Date(dataString + 'T00:00:00');
            if (!isNaN(dataObj.getTime())) {
                const dia = String(dataObj.getDate()).padStart(2, '0');
                const mes = String(dataObj.getMonth() + 1).padStart(2, '0'); // Meses são base 0
                const ano = dataObj.getFullYear();
                return `${dia}/${mes}/${ano}`;
            }
        }
    }
    return '-'; 
}

/**
 * Obtém o dia e mês atuais no formato "MM-DD".
 * @returns {string} String no formato "MM-DD".
 */
function getDataAtualMMDD() {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${mes}-${dia}`;
}

let activeModalElement = null; // Referência para o elemento modal atualmente visível

function _getModalDOMElements() {
    const modal = document.getElementById('confirmActionModal'); // ID padrão do modal
    if (!modal) {
        // console.warn("Elemento modal 'confirmActionModal' não encontrado na página atual.");
        return null;
    }
    return {
        modal: modal,
        title: modal.querySelector('#modalTitle'),
        message: modal.querySelector('#modalMessage'),
        confirmBtn: modal.querySelector('#btnConfirmModal'),
        cancelBtn: modal.querySelector('#btnCancelModal'),
        editForm: modal.querySelector('#modalEditForm'),
        sellForm: modal.querySelector('#modalSellForm')
    };
}

function showConfirmationModal(title, message, onConfirmCallback, confirmBtnText = 'Confirmar', cancelBtnText = 'Cancelar') {
    const elements = _getModalDOMElements();
    if (!elements) return;

    if (elements.editForm) elements.editForm.style.display = 'none';
    if (elements.sellForm) elements.sellForm.style.display = 'none';
    elements.message.style.display = '';
    elements.title.textContent = title;
    elements.message.textContent = message;

    elements.confirmBtn.textContent = confirmBtnText;
    elements.confirmBtn.style.display = '';
    elements.confirmBtn.onclick = () => {
        hideModal();
        if (onConfirmCallback) onConfirmCallback();
    };

    elements.cancelBtn.textContent = cancelBtnText;
    elements.cancelBtn.style.display = '';
    elements.cancelBtn.onclick = () => {
        hideModal();
        // Poderia ter um onCancelCallback aqui se necessário no futuro
    };

    elements.modal.style.display = 'block';
    activeModalElement = elements.modal;
}

function showNotificationModal(title, message, okBtnText = 'OK') {
    const elements = _getModalDOMElements();
    if (!elements) return;

    if (elements.editForm) elements.editForm.style.display = 'none';
    if (elements.sellForm) elements.sellForm.style.display = 'none';
    elements.message.style.display = '';
    elements.title.textContent = title;
    elements.message.textContent = message;

    elements.confirmBtn.textContent = okBtnText;
    elements.confirmBtn.style.display = '';
    elements.confirmBtn.onclick = () => {
        hideModal();
    };

    elements.cancelBtn.style.display = 'none'; // Oculta o botão de cancelar para notificações

    elements.modal.style.display = 'block';
    activeModalElement = elements.modal;
}

function showEditModal(title, peca, onSaveCallback, saveBtnText = 'Salvar', cancelBtnText = 'Cancelar') {
    const elements = _getModalDOMElements();
    if (!elements || !elements.editForm) {
        console.error("Modal de edição ou seus campos não foram encontrados.");
        return;
    }

    // Garante que a mensagem esteja oculta e o formulário de edição visível
    elements.message.style.display = 'none';
    if (elements.sellForm) elements.sellForm.style.display = 'none';
    elements.editForm.style.display = 'block';

    elements.title.textContent = title;

    // Preenche os campos do formulário
    let diaCompraVal = '';
    let mesCompraVal = '';
    if (peca.dataCompra && typeof peca.dataCompra === 'string' && peca.dataCompra.includes('-')) {
        const partes = peca.dataCompra.split('-');
        if (partes.length === 2) { // Formato MM-DD
            mesCompraVal = partes[0];
            diaCompraVal = partes[1];
        }
    }

    elements.editForm.querySelector('#editPecaId').value = peca.id;
    elements.editForm.querySelector('#editNomePeca').value = peca.nome;
    elements.editForm.querySelector('#editCorPeca').value = peca.cor || '';
    elements.editForm.querySelector('#editTamanhoPeca').value = peca.tamanho || ''; // Preencher tamanho
    const editDiaCompraInput = elements.editForm.querySelector('#editDiaCompra');
    const editMesCompraInput = elements.editForm.querySelector('#editMesCompra');
    elements.editForm.querySelector('#editQuantidade').value = peca.quantidade || 1;

    if (editDiaCompraInput) editDiaCompraInput.value = diaCompraVal;
    if (editMesCompraInput) editMesCompraInput.value = mesCompraVal;

    elements.editForm.querySelector('#editPrecoCompra').value = peca.precoCompraUnitario !== undefined ? peca.precoCompraUnitario : peca.compra;
    elements.editForm.querySelector('#editPrecoVenda').value = peca.venda;

    elements.confirmBtn.textContent = saveBtnText;
    elements.confirmBtn.style.display = '';
    elements.confirmBtn.onclick = () => {
        // Coleta os dados do formulário de edição
        const dadosEditados = {
            id: parseInt(elements.editForm.querySelector('#editPecaId').value),
            nome: elements.editForm.querySelector('#editNomePeca').value.trim(),
            cor: elements.editForm.querySelector('#editCorPeca').value.trim(),
            tamanho: elements.editForm.querySelector('#editTamanhoPeca').value.trim(), // Coletar tamanho
            dataCompra: `${String(elements.editForm.querySelector('#editMesCompra').value).padStart(2, '0')}-${String(elements.editForm.querySelector('#editDiaCompra').value).padStart(2, '0')}`,
            quantidade: parseInt(elements.editForm.querySelector('#editQuantidade').value) || 1,
            precoCompraUnitario: parseFloat(elements.editForm.querySelector('#editPrecoCompra').value),
            venda: parseFloat(elements.editForm.querySelector('#editPrecoVenda').value),
        };
        hideModal(); // Esconde o modal antes de chamar o callback
        if (onSaveCallback) onSaveCallback(dadosEditados);
    };

    elements.cancelBtn.textContent = cancelBtnText;
    elements.cancelBtn.style.display = '';
    elements.cancelBtn.onclick = hideModal;

    elements.modal.style.display = 'block';
    activeModalElement = elements.modal;
}

function showSellQuantityModal(title, peca, onConfirmCallback, confirmBtnText = 'Confirmar Venda', cancelBtnText = 'Cancelar') {
    const elements = _getModalDOMElements();
    if (!elements || !elements.sellForm) {
        console.error("Modal de venda com quantidade ou seus campos não foram encontrados.");
        showNotificationModal("Erro de Interface", "Não foi possível abrir o formulário de venda. Verifique o console.");
        return;
    }

    elements.message.style.display = 'none';
    if (elements.editForm) elements.editForm.style.display = 'none';
    elements.sellForm.style.display = 'block';

    elements.title.textContent = title;

    // Preenche os campos do formulário de venda
    elements.sellForm.querySelector('#sellPecaNome').textContent = peca.nome;
    elements.sellForm.querySelector('#sellPecaCor').textContent = peca.cor || '-';
    elements.sellForm.querySelector('#sellPecaEstoqueAtual').textContent = peca.quantidade;
    elements.sellForm.querySelector('#sellPecaId').value = peca.id;
    const quantidadeInput = elements.sellForm.querySelector('#sellQuantidade');
    const errorSpan = elements.sellForm.querySelector('#sellQuantityError');
    
    quantidadeInput.value = 1; // Default para 1
    quantidadeInput.max = peca.quantidade; // Define o máximo baseado no estoque
    if (errorSpan) errorSpan.textContent = ''; // Limpa erros anteriores

    elements.confirmBtn.textContent = confirmBtnText;
    elements.confirmBtn.style.display = '';
    elements.confirmBtn.onclick = () => {
        const pecaId = parseInt(elements.sellForm.querySelector('#sellPecaId').value);
        const quantidadeVendida = parseInt(quantidadeInput.value);

        if (errorSpan) errorSpan.textContent = ''; // Limpa erro

        if (isNaN(quantidadeVendida) || quantidadeVendida < 1) {
            if (errorSpan) errorSpan.textContent = 'Quantidade deve ser ao menos 1.';
            quantidadeInput.focus();
            return; // Não fecha modal, não chama callback
        }
        if (quantidadeVendida > peca.quantidade) {
            if (errorSpan) errorSpan.textContent = `Máximo em estoque: ${peca.quantidade}.`;
            quantidadeInput.focus();
            return; // Não fecha modal, não chama callback
        }

        hideModal(); // Esconde o modal antes de chamar o callback
        if (onConfirmCallback) onConfirmCallback(pecaId, quantidadeVendida);
    };

    elements.cancelBtn.textContent = cancelBtnText;
    elements.cancelBtn.style.display = '';
    elements.cancelBtn.onclick = hideModal;

    elements.modal.style.display = 'block';
    activeModalElement = elements.modal;
    quantidadeInput.focus();
}

function hideModal() {
    if (activeModalElement) {
        activeModalElement.style.display = 'none';
        // Limpa os onclicks para evitar chamadas múltiplas se o modal for reutilizado rapidamente
        const elements = _getModalDOMElements();
        if (elements && elements.confirmBtn) elements.confirmBtn.onclick = null;
        if (elements && elements.cancelBtn) elements.cancelBtn.onclick = null;
        activeModalElement = null;
    }
}

/**
 * Verifica se o usuário está logado. Se não, redireciona para a página de login.
 */
function checkLoginAndRedirect() {
    if (!isUserLoggedIn()) {
        window.location.href = 'login.html';
    }
}
// --- Theme Toggle Logic ---
function applyTheme(theme) {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggleBtn) themeToggleBtn.textContent = '🌙'; // Moon for dark mode
    } else {
        document.body.classList.remove('light-theme');
        if (themeToggleBtn) themeToggleBtn.textContent = '☀️'; // Sun for light mode
    }
}

function toggleTheme() {
    let newTheme;
    if (document.body.classList.contains('light-theme')) {
        newTheme = 'dark';
    } else {
        newTheme = 'light';
    }
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyTheme(newTheme);
}

document.addEventListener('DOMContentLoaded', () => {
    // Verifica o login em páginas que não são de autenticação
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'login.html' && currentPage !== 'register.html' && currentPage !== 'admin-login.html') {
        // A chamada específica para proteger páginas como index, estoque, vendas será feita nos scripts dessas páginas.
    }

    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark'; // Default to dark
    applyTheme(savedTheme);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && isUserLoggedIn()) {
        logoutBtn.style.display = 'inline-block'; // Mostra o botão
        logoutBtn.addEventListener('click', logoutUser);
    }

    window.addEventListener('click', (event) => {
        if (activeModalElement && event.target === activeModalElement) {
            hideModal();
        }
    });
});

/**
 * Converte uma string de data ISO "YYYY-MM-DD" para "MM-DD".
 * @param {string} isoDateString Data no formato "YYYY-MM-DD".
 * @returns {string|null} String "MM-DD" ou null se a entrada for inválida.
 */
function getMesDiaFromISODate(isoDateString) {
    if (!isoDateString) return null;
    try {
        // O input type="date" já retorna YYYY-MM-DD, não precisa de T00:00:00 aqui para extrair partes
        const partes = isoDateString.split('-');
        if (partes.length === 3) {
            return `${partes[1]}-${partes[2]}`; // MM-DD
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Nota: A função de adicionar nova peça está em estoque_script.js
// A lógica de cálculo de lucro e total gasto é adaptada em cada script de página.
