document.addEventListener('DOMContentLoaded', () => {
    // Script para o botão de logout do admin
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/admin/logout', {
                    method: 'POST',
                    credentials: 'include' // Importante para enviar o cookie de sessão
                });
                if (response.ok) {
                    window.location.href = '/admin-login.html'; // Redireciona para a página de login do admin
                } else {
                    showNotificationModal('Erro', 'Não foi possível fazer logout. Tente novamente.');
                }
            } catch (error) {
                showNotificationModal('Erro de Rede', 'Não foi possível conectar ao servidor para fazer logout.');
            }
        });
    }

    async function fetchRequests() {
        const response = await fetch('/admin/api/requests', { credentials: 'include' });

        // Verifica se a resposta indica que o usuário não está logado ou foi redirecionado
        if (response.redirected || response.status === 401 || response.status === 403) {
            console.warn('Sessão de administrador inválida ou expirada. Redirecionando para login.');
            window.location.href = '/admin-login.html'; // Redireciona no lado do cliente
            return []; // Retorna um array vazio para parar o processamento
        }

        if (!response.ok) {
             console.error('Erro ao buscar solicitações:', response.statusText);
             showNotificationModal('Erro', 'Não foi possível carregar as solicitações pendentes.');
             return []; // Return empty array on error
        }
        const users = await response.json(); // Renamed requests to users for clarity
        const tbody = document.getElementById('requestsTable').getElementsByTagName('tbody')[0];
        tbody.innerHTML = ''; // Limpar tabela
        
        if (users.length === 0) {
            const tr = tbody.insertRow();
            const td = tr.insertCell();
            td.setAttribute('colspan', '3'); // Corrigido para 3 colunas
            td.textContent = 'Nenhuma solicitação pendente no momento.';
            td.style.textAlign = 'center';
        } else {
            users.forEach(user => { // Iterate through users
                const row = tbody.insertRow();
                // Não exibimos o _id na tabela, mas o armazenamos no elemento da linha se necessário
                // row.dataset.userId = req._id; // Opcional: armazenar o ID na linha
                row.insertCell().textContent = user.email; // Exibe o email do usuário
                const statusCell = row.insertCell(); // Get reference to status cell
                statusCell.textContent = user.status === 'pending' ? 'Pendente' : (user.status === 'active' ? 'Aceito' : user.status); // Display status in Portuguese

                const actionsCell = row.insertCell();
                actionsCell.classList.add('actions-cell'); // Add a class for potential styling

                // Render buttons based on status
                if (user.status === 'pending') {
                    const approveButton = document.createElement('button');
                    approveButton.textContent = 'Aprovar';
                    approveButton.onclick = () => confirmAdminAction(user._id, 'approve', row, statusCell, actionsCell); // Pass row, statusCell, actionsCell
                    actionsCell.appendChild(approveButton);

                    const denyButton = document.createElement('button');
                    denyButton.textContent = 'Negar';
                    denyButton.onclick = () => confirmAdminAction(user._id, 'deny', row, statusCell, actionsCell); // Pass row, statusCell, actionsCell
                    denyButton.classList.add('btn-delete');
                    actionsCell.appendChild(denyButton);
                } else if (user.status === 'active') {
                     const revokeButton = document.createElement('button');
                     revokeButton.textContent = 'Revogar';
                     revokeButton.onclick = () => confirmAdminAction(user._id, 'revoke', row, statusCell, actionsCell); // Pass row, statusCell, actionsCell
                     revokeButton.classList.add('btn-delete'); // Maybe use a different class? Or keep btn-delete? Let's use btn-delete for now.
                     actionsCell.appendChild(revokeButton);
                }
            });
        }
        return users;
    }

    // Added statusCell and actionsCell parameters
    function confirmAdminAction(userId, action, rowElement, statusCell, actionsCell) {
        const actionText = action === 'approve' ? 'aprovar' : 'negar';
        const title = `Confirmar ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`;
        const message = `Tem certeza que deseja ${actionText} a solicitação (ID: ${userId})?`; // Use userId in message
        
        showConfirmationModal(
            title,
            message,
            async () => { // Este é o onConfirmCallback que será executado se o usuário confirmar
                try {
                    await handleAction(userId, action); // Chama a função que envia a requisição ao backend

                    // Update the row and buttons based on the action
                    if (action === 'approve') {
                        statusCell.textContent = 'Aceito'; // Update status text
                        actionsCell.innerHTML = ''; // Clear existing buttons
                        const revokeButton = document.createElement('button');
                        revokeButton.textContent = 'Revogar';
                        revokeButton.onclick = () => confirmAdminAction(userId, 'revoke', rowElement, statusCell, actionsCell);
                        revokeButton.classList.add('btn-delete'); // Use btn-delete for revoke
                        actionsCell.appendChild(revokeButton);
                        showNotificationModal('Sucesso', `Solicitação (ID: ${userId}) aprovada com sucesso.`);
                    } else if (action === 'deny') {
                         rowElement.remove(); // Remove the row for denied requests
                         showNotificationModal('Sucesso', `Solicitação (ID: ${userId}) negada com sucesso.`);
                         // If the last pending request was denied, update the "No pending requests" message
                         const pendingRequests = document.querySelectorAll('#requestsTable tbody tr');
                         if (pendingRequests.length === 0) {
                             const tbody = document.getElementById('requestsTable').getElementsByTagName('tbody')[0];
                             const tr = tbody.insertRow();
                             const td = tr.insertCell();
                             td.setAttribute('colspan', '3');
                             td.textContent = 'Nenhuma solicitação pendente no momento.';
                             td.style.textAlign = 'center';
                         }
                    } else if (action === 'revoke') {
                         statusCell.textContent = 'Pendente'; // Update status text back to pending
                         actionsCell.innerHTML = ''; // Clear existing buttons
                         const approveButton = document.createElement('button');
                         approveButton.textContent = 'Aprovar';
                         approveButton.onclick = () => confirmAdminAction(userId, 'approve', rowElement, statusCell, actionsCell);
                         actionsCell.appendChild(approveButton);

                         const denyButton = document.createElement('button');
                         denyButton.textContent = 'Negar';
                         denyButton.onclick = () => confirmAdminAction(userId, 'deny', rowElement, statusCell, actionsCell);
                         denyButton.classList.add('btn-delete');
                         actionsCell.appendChild(denyButton);
                         showNotificationModal('Sucesso', `Solicitação (ID: ${userId}) revogada com sucesso.`);
                    }
                } catch (error) {
                    console.error(`Erro ao ${actionText} solicitação (ID: ${userId}):`, error);
                    showNotificationModal('Erro', error.message || `Não foi possível ${actionText} a solicitação (ID: ${userId}).`);
                }
            }
        );
    }

    // Updated function to handle different actions (approve, deny, revoke)
    async function handleAction(userId, action) {
        const response = await fetch(`/admin/api/requests/${userId}/${action}`, { // userId is the _id of the MongoDB document
            method: 'POST',
            credentials: 'include', // Adicionado para enviar cookies de sessão
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Verifica se a resposta indica que o usuário não está logado ou foi redirecionado
        if (response.redirected || response.status === 401 || response.status === 403) {
             console.warn('Sessão de administrador inválida ou expirada durante a ação. Redirecionando para login.');
             window.location.href = '/admin-login.html'; // Redireciona no lado do cliente
             // Não lança erro aqui, pois o redirecionamento é o comportamento esperado
             throw new Error('Sessão expirada. Por favor, faça login novamente.'); // Throw error to be caught by confirmAdminAction
        }

        // Verifica se a resposta foi bem-sucedida (status 2xx)
        if (!response.ok) { // Se não for OK, tenta ler a mensagem de erro do backend
            const errorData = await response.json().catch(() => ({ message: `Erro ${response.status} ao ${action} solicitação ${requestId}.` }));
            // Lança um erro para ser capturado no confirmAdminAction
            throw new Error(errorData.message || `Erro ao ${action} solicitação ${requestId}.`);
        }
        // Se a resposta for OK, não é necessário fazer nada aqui,
        // pois a remoção da linha e a notificação de sucesso são feitas em confirmAdminAction.
    }

    // Carregar solicitações quando a página carregar
    fetchRequests();
});