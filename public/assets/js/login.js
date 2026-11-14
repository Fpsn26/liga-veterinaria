const form = document.querySelector('#login-form');
const message = document.querySelector('#login-message');
const button = document.querySelector('#login-button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  message.textContent = 'Entrando…';
  try {
    const csrfResponse = await fetch('/api/auth/csrf');
    if (!csrfResponse.ok) throw new Error('Não foi possível iniciar o login. Tente novamente.');
    const { csrfToken } = await csrfResponse.json();
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ identifier: form.elements.identifier.value, password: form.elements.password.value }),
    });
    const result = await response.json();
    form.elements.password.value = '';
    if (!response.ok) throw new Error(result.error);
    location.assign('/pages/painel.html');
  } catch (error) {
    message.textContent = error.message || 'Não foi possível entrar.';
  } finally {
    button.disabled = false;
  }
});
