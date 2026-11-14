const form = document.querySelector('#password-change-form');
const message = document.querySelector('#change-message');
const button = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!data.identifier?.trim() || !data.currentPassword?.trim()) {
    message.textContent = 'Informe email ou matrícula e senha atual.';
    return;
  }
  if (data.password !== data.confirmation || data.password.length < 8 || data.password.length > 1024
    || !/\p{Lu}/u.test(data.password) || !/[\p{N}]|[^\p{L}\p{N}\s]/u.test(data.password)) {
    message.textContent = 'As senhas devem coincidir e ter de 8 a 1024 caracteres, uma letra maiúscula e um número ou caractere especial.';
    return;
  }
  button.disabled = true;
  message.textContent = 'Aguarde…';
  try {
    const csrfResponse = await fetch('/api/auth/csrf');
    if (!csrfResponse.ok) throw new Error('Não foi possível iniciar a solicitação. Atualize a página.');
    const { csrfToken } = await csrfResponse.json();
    const response = await fetch('/api/password-change', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    message.textContent = result.message;
    form.reset();
    form.hidden = true;
  } catch (error) {
    message.textContent = error.message || 'Não foi possível concluir. Tente novamente.';
  } finally { button.disabled = false; }
});
