// js/register_script.js
document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const registerMessageEl = document.getElementById('registerMessage');
    const passwordInput = document.getElementById('password'); // Adicionado para o toggle
    const togglePassword = document.getElementById('togglePassword'); // Adicionado para o toggle
    const confirmPasswordInput = document.getElementById('confirmPassword'); // Adicionado para o toggle
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword'); // Adicionado para o toggle


    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        registerMessageEl.textContent = '';
        registerMessageEl.style.color = 'var(--loss-color)';


        const email = document.getElementById('email').value;
        const password = passwordInput.value; // Usa a variável já definida
        const confirmPassword = confirmPasswordInput.value; // Usa a variável já definida

        if (password !== confirmPassword) {
            registerMessageEl.textContent = 'As senhas não coincidem.';
            return; // Para a execução se as senhas não baterem
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                registerMessageEl.textContent = data.message || 'Usuário registrado com sucesso! Aguardando aprovação do administrador.';
                registerMessageEl.style.color = 'var(--profit-color)';
                registerForm.reset();
            } else {
                registerMessageEl.textContent = data.message || 'Falha no registro.';
            }
        } catch (error) {
            console.error('Erro ao tentar registrar:', error);
            registerMessageEl.textContent = 'Erro de conexão. Tente novamente.';
        }
    });

    // Função auxiliar para o toggle de senha
    function setupPasswordToggle(inputElement, toggleElement) {
        if (toggleElement && inputElement) {
            toggleElement.addEventListener('click', () => {
                const type = inputElement.getAttribute('type') === 'password' ? 'text' : 'password';
                inputElement.setAttribute('type', type);
                // Alterna o texto do botão
                if (type === 'password') {
                    toggleElement.innerHTML = '<i class="bi bi-eye"></i>';
                } else {
                    toggleElement.innerHTML = '<i class="bi bi-eye-slash"></i>';
                }
            });
        }
    }

    setupPasswordToggle(passwordInput, togglePassword);
    setupPasswordToggle(confirmPasswordInput, toggleConfirmPassword);
});
