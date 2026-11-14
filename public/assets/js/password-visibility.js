// Aprimoramento visual: sem JavaScript, os campos continuam ocultando as senhas.
{
  for (const input of document.querySelectorAll('input[type="password"]')) {
    const wrapper = document.createElement('span');
    wrapper.className = 'password-field';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-visibility';
    button.setAttribute('aria-controls', input.id);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z',
      'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    const slash = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    slash.setAttribute('d', 'M3 3 21 21');
    svg.append(slash);
    button.append(svg);

    const update = (visible) => {
      input.type = visible ? 'text' : 'password';
      const label = visible ? 'Ocultar senha' : 'Mostrar senha';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(visible));
      button.title = label;
      slash.style.display = visible ? '' : 'none';
    };
    button.addEventListener('click', () => update(input.type === 'password'));
    input.form?.addEventListener('reset', () => update(false));
    // Após uma tentativa de envio, a senha volta ao modo oculto.
    input.form?.addEventListener('submit', () => update(false));
    input.before(wrapper);
    wrapper.append(input, button);
    update(false);
  }
}
