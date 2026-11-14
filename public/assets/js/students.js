const form = document.querySelector('#student-form');
const message = document.querySelector('#student-message');
const passwordMessage = document.querySelector('#initial-password');
const list = document.querySelector('#students-list');
const save = document.querySelector('#save-student');
const cancel = document.querySelector('#cancel-edit');
let editingId = null;
let busy = false;

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (method !== 'GET') {
    const csrf = await fetch('/api/auth/csrf');
    if (!csrf.ok) throw new Error('Sessão indisponível. Entre novamente.');
    headers['X-CSRF-Token'] = (await csrf.json()).csrfToken;
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`/api/admin/students${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

function resetForm() {
  editingId = null;
  form.reset();
  document.querySelector('#form-title').textContent = 'Adicionar aluno';
  save.textContent = 'Adicionar aluno';
  cancel.hidden = true;
}

async function loadStudents() {
  const { students } = await api('');
  list.replaceChildren();
  if (!students.length) { list.textContent = 'Nenhum aluno cadastrado.'; return; }
  for (const student of students) {
    const row = document.createElement('article');
    row.className = 'record-list-item';
    const text = document.createElement('p');
    text.className = 'record-info';
    text.textContent = `${student.name}\nMatrícula: ${student.registrationNumber}\nEmail: ${student.email}\nSituação: ${student.status === 'active' ? 'Ativo' : 'Desligado'}`;
    const actions = document.createElement('div');
    actions.className = 'record-actions';
    row.append(text, actions);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => {
      if (busy) return;
      editingId = student.id;
      form.elements.name.value = student.name;
      form.elements.registrationNumber.value = student.registrationNumber;
      form.elements.email.value = student.email;
      document.querySelector('#form-title').textContent = 'Editar aluno';
      save.textContent = 'Salvar alterações';
      cancel.hidden = false;
      passwordMessage.textContent = '';
      form.elements.name.focus();
    });
    actions.append(edit);
    if (student.status === 'active') {
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.textContent = 'Desligar';
      dismiss.addEventListener('click', async () => {
        if (busy || !window.confirm(`Desligar ${student.name}? O acesso será bloqueado e o histórico será preservado.`)) return;
        busy = true;
        save.disabled = true;
        passwordMessage.textContent = '';
        try {
          await api(`/${student.id}/dismiss`, { method: 'POST', body: { confirmed: true } });
          message.textContent = 'Aluno desligado. Histórico preservado.';
          resetForm();
          await loadStudents();
        } catch (error) { message.textContent = error.message; }
        finally { busy = false; save.disabled = false; }
      });
      actions.append(dismiss);
    }
    list.append(row);
  }
}

cancel.addEventListener('click', () => { if (!busy) resetForm(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const body = { name: form.elements.name.value, registrationNumber: form.elements.registrationNumber.value, email: form.elements.email.value };
  if (!window.confirm(editingId ? `Salvar alterações de ${body.name}? A senha atual será mantida.` : `Adicionar ${body.name} à LAHVET?`)) return;
  const targetId = editingId;
  busy = true;
  save.disabled = true;
  passwordMessage.textContent = '';
  try {
    const data = await api(targetId ? `/${targetId}` : '', { method: targetId ? 'PUT' : 'POST', body: { ...body, confirmed: true } });
    message.textContent = targetId ? 'Dados atualizados. A senha foi mantida.' : 'Aluno adicionado.';
    if (data.initialPassword) passwordMessage.textContent = `Senha inicial para entrega pelo diretor: ${data.initialPassword}. Anote antes de sair desta página.`;
    resetForm();
    await loadStudents();
  } catch (error) { message.textContent = error.message; }
  finally { busy = false; save.disabled = false; }
});
loadStudents().catch((error) => { message.textContent = error.message; });
