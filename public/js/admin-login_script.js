document.addEventListener('DOMContentLoaded', () => {
    const adminLoginForm = document.getElementById('adminLoginForm');
    const adminLoginError = document.getElementById('adminLoginError');
    const passwordInput = document.getElementById('password'); // Adicionado para o toggle
    const togglePassword = document.getElementById('togglePassword'); // Adicionado para o toggle

    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            adminLoginError.textContent = ''; // Limpa mensagens de erro anteriores

            const usernameInput = document.getElementById('username');
            // passwordInput já foi obtido acima

            const username = usernameInput.value;
            const password = passwordInput.value;

            try {
                const response = await fetch('/admin/login', { // A rota no seu server.js para login do admin
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                if (response.ok) {
                    // Se o backend redirecionar, o fetch seguirá o redirecionamento.
                    // A URL final será a do dashboard.
                    if (response.redirected) {
                        window.location.href = response.url; // Redireciona para o dashboard
                    } else {
                        // Se o backend não redirecionar mas der OK (ex: retornar JSON com sucesso)
                        window.location.href = '/admin/dashboard'; // Redireciona manualmente
                    }
                } else {
                    const errorData = await response.text(); // O backend envia texto simples no erro 401
                    adminLoginError.textContent = errorData || 'Falha no login. Verifique suas credenciais.';
                }
            } catch (error) {
                console.error('Erro ao tentar fazer login do admin:', error);
                adminLoginError.textContent = 'Erro ao conectar com o servidor. Tente novamente.';
            }
        });
    }

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            // Alterna o tipo do input
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            // Alterna o texto do botão
            if (type === 'password') {
                togglePassword.innerHTML = '<i class="bi bi-eye"></i>';
            } else {
                togglePassword.innerHTML = '<i class="bi bi-eye-slash"></i>';
            }
        });
    }
});