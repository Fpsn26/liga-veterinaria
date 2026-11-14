const form = document.querySelector('#password-reset-form');
const message = document.querySelector('#reset-message');
const button = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const confirm = form.dataset.action === 'confirm';
  const data = Object.fromEntries(new FormData(form));
  if (confirm && (data.password !== data.confirmation || !/\p{Lu}/u.test(data.password)
    || !/[\p{N}]|[^\p{L}\p{N}\s]/u.test(data.password))) {
    message.textContent = 'As senhas devem coincidir e conter uma letra maiúscula e um número ou caractere especial.';
    return;
  }
  button.disabled = true;
  message.textContent = 'Aguarde…';
  try {
    const csrfResponse = await fetch('/api/auth/csrf');
    if (!csrfResponse.ok) throw new Error('Não foi possível iniciar a solicitação. Atualize a página.');
    const { csrfToken } = await csrfResponse.json();
    const response = await fetch(`/api/password-reset/${confirm ? 'confirm' : 'request'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    message.textContent = result.message;
    form.reset();
    if (confirm) form.hidden = true;
  } catch (error) {
    message.textContent = error.message || 'Não foi possível concluir. Tente novamente.';
  } finally { button.disabled = false; }
});
