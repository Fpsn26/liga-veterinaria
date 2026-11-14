const form = document.querySelector('#meeting-form');
const message = document.querySelector('#meeting-message');
const meetingsList = document.querySelector('#meetings-list');
const attendanceList = document.querySelector('#attendance-list');
const detail = document.querySelector('#meeting-detail');
let selectedId = null;
let busy = false;

async function api(path, method = 'GET', body) {
  const headers = {};
  if (method !== 'GET') {
    const response = await fetch('/api/auth/csrf');
    if (!response.ok) throw new Error('Sessão indisponível. Entre novamente.');
    headers['X-CSRF-Token'] = (await response.json()).csrfToken;
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`/api/admin/meetings${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

async function mutation(path, method, body, success) {
  if (busy) return;
  busy = true;
  document.querySelector('#register-meeting').disabled = true;
  try {
    await api(path, method, body);
    message.textContent = success;
    await loadMeetings();
    if (selectedId) await loadDetail(selectedId);
  } catch (error) { message.textContent = error.message; }
  finally { busy = false; document.querySelector('#register-meeting').disabled = false; }
}

async function loadMeetings() {
  const { meetings } = await api('');
  meetingsList.replaceChildren();
  if (!meetings.length) meetingsList.textContent = 'Nenhuma reunião registrada.';
  const labels = { scheduled: 'Agendada', held: 'Realizada', cancelled: 'Cancelada' };
  for (const meeting of meetings) {
    const row = document.createElement('article');
    row.className = 'record-list-item';
    const text = document.createElement('p');
    text.className = 'record-info';
    text.textContent = `Reunião ${meeting.number}\n${meeting.date} às ${meeting.time}\n${meeting.activity}\n${labels[meeting.status]}`;
    const actions = document.createElement('div');
    actions.className = 'record-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Abrir chamada';
    open.addEventListener('click', () => {
      if (!busy) loadDetail(meeting.id).catch((error) => { message.textContent = error.message; });
    });
    actions.append(open);
    row.append(text, actions);
    meetingsList.append(row);
  }
}

async function loadDetail(id) {
  const { meeting, participants } = await api(`/${id}`);
  selectedId = id;
  detail.hidden = false;
  document.querySelector('#detail-title').textContent = `Reunião ${meeting.number} — ${meeting.activity}`;
  document.querySelector('#detail-state').textContent = meeting.attendanceCompleted ? 'Chamada concluída. Correções continuam disponíveis ao Admin.' : 'Chamada ainda não concluída.';
  document.querySelector('#start-meeting').hidden = meeting.status !== 'scheduled';
  document.querySelector('#cancel-meeting').hidden = meeting.status !== 'scheduled';
  document.querySelector('#complete-meeting').hidden = meeting.status !== 'held' || meeting.attendanceCompleted;
  attendanceList.replaceChildren();
  if (!participants.length) attendanceList.textContent = 'Inicie a reunião para fixar os participantes ativos e lançar a chamada.';
  for (const student of participants) {
    const row = document.createElement('article');
    row.className = 'record-list-item attendance-record';
    const name = document.createElement('p');
    name.className = 'record-info';
    name.textContent = `${student.name} — ${student.registrationNumber}${student.studentStatus === 'dismissed' ? ' — Desligado (histórico)' : ''}`;
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Presença de ${student.name}`);
    for (const [value, label] of [['', 'Pendente'], ['present', 'Presente'], ['absent', 'Falta']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = student.status ?? '';
    select.disabled = meeting.status !== 'held';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Salvar presença/falta';
    save.disabled = meeting.status !== 'held';
    save.addEventListener('click', async () => {
      if (busy) return;
      if (!select.value) { message.textContent = 'Selecione Presente ou Falta.'; return; }
      if (student.justification && select.value === 'present' && !window.confirm('Marcar presença e remover a justificativa desta falta?')) return;
      await mutation(`/${id}/attendance/${student.id}`, 'PUT', { status: select.value }, 'Lançamento salvo.');
    });
    const controls = document.createElement('div');
    controls.className = 'record-controls';
    controls.append(select, save);
    row.append(name, controls);
    if (student.status === 'absent' && meeting.status === 'held') {
      const justification = document.createElement('textarea');
      justification.setAttribute('aria-label', `Justificativa da falta de ${student.name}`);
      justification.maxLength = 2000;
      justification.value = student.justification ?? '';
      const justify = document.createElement('button');
      justify.type = 'button';
      justify.textContent = 'Salvar justificativa';
      justify.addEventListener('click', () => {
        if (busy) return;
        const text = justification.value.trim();
        if (!text) { message.textContent = 'Preencha a justificativa ou use o botão Remover justificativa.'; return; }
        mutation(`/${id}/justification/${student.id}`, 'PUT', { justification: text }, 'Falta justificada, sem abono.');
      });
      const justificationBlock = document.createElement('div');
      justificationBlock.className = 'record-justification';
      const actions = document.createElement('div');
      actions.className = 'record-actions';
      actions.append(justify);
      justificationBlock.append(justification, actions);
      row.append(justificationBlock);
      if (student.justification) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remover justificativa';
        remove.addEventListener('click', () => {
          if (!busy && window.confirm('Remover a justificativa? A falta será mantida.')) {
            mutation(`/${id}/justification/${student.id}`, 'PUT', { justification: null }, 'Justificativa removida.');
          }
        });
        actions.append(remove);
      }
    }
    attendanceList.append(row);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  mutation('', 'POST', { date: form.elements.date.value, time: form.elements.time.value, activity: form.elements.activity.value }, 'Reunião registrada.');
});
for (const [selector, action, question, success] of [
  ['#start-meeting', 'start', 'Iniciar a reunião e fixar a chamada com os alunos ativos?', 'Reunião iniciada. Preencha a chamada.'],
  ['#cancel-meeting', 'cancel', 'Cancelar esta reunião? O número será preservado.', 'Reunião cancelada.'],
  ['#complete-meeting', 'complete', 'Concluir a chamada desta reunião?', 'Chamada concluída.'],
]) {
  document.querySelector(selector).addEventListener('click', () => {
    if (!busy && selectedId && window.confirm(question)) mutation(`/${selectedId}/${action}`, 'POST', { confirmed: true }, success);
  });
}
loadMeetings().catch((error) => { message.textContent = error.message; });
