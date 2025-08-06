// js/login_script.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginErrorEl = document.getElementById('loginError');
    const passwordInput = document.getElementById('password'); // Adicionado para o toggle
    const togglePassword = document.getElementById('togglePassword'); // Adicionado para o toggle

    // Se já estiver logado, redireciona para o painel
    if (isUserLoggedIn()) {
        window.location.href = 'index.html';
        return;
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        loginErrorEl.textContent = '';

        const email = document.getElementById('email').value;
        const password = passwordInput.value; // Usa a variável já definida

        try {
            // A URL agora será http://localhost:3000/api/auth/login (local)
            // ou https://docevenenoestoque.onrender.com/api/auth/login (produção)
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });


            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('accessToken', data.accessToken);
                window.location.href = 'index.html'; // Redireciona para o painel principal
            } else {
                let errorMessage = 'Falha no login.'; // Mensagem de erro padrão
                try {
                    const errorData = await response.json(); // Tenta analisar como JSON
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    // Se a resposta não for JSON (ex: página de erro HTML)
                    console.warn('A resposta de erro não era JSON válido:', response.status, response.statusText);
                    errorMessage = `Erro ${response.status}: ${response.statusText || 'Ocorreu um erro ao contatar o servidor.'}`;
                }
                loginErrorEl.textContent = errorMessage;
            }
        } catch (error) {
            console.error('Erro ao tentar fazer login:', error);
            loginErrorEl.textContent = 'Erro de conexão ou ao processar a resposta. Tente novamente.';
        }
    });

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
