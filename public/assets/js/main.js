// Ao restaurar pelo histórico, revalidar a sessão antes de reutilizar o menu.
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
