const form = document.querySelector('#meeting-form');
const message = document.querySelector('#meeting-message');
const meetingsList = document.querySelector('#meetings-list');
const attendanceList = document.querySelector('#attendance-list');
const detail = document.querySelector('#meeting-detail');
let selectedId = null;
let currentMeeting = null;
let draftRows = [];
let openButtons = [];
let detailSequence = 0;
let listSequence = 0;
let loadingDetail = false;
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

function recordsFromDraft() {
  return draftRows.map(row => ({ studentId: row.id, status: row.select.value || null,
    justification: row.select.value === 'absent' ? row.justification.value.trim() || null : null }));
}

function hasUnsavedChanges() {
  return recordsFromDraft().some((record, index) => record.status !== draftRows[index].originalStatus
    || record.justification !== draftRows[index].originalJustification);
}

function updateControls() {
  const locked = busy || loadingDetail;
  for (const selector of ['#register-meeting', '#start-meeting', '#cancel-meeting', '#save-attendance', '#complete-meeting']) {
    document.querySelector(selector).disabled = locked;
  }
  for (const button of openButtons) button.disabled = locked;
  for (const row of draftRows) {
    row.select.disabled = locked || currentMeeting?.status !== 'held';
    row.justification.disabled = locked || currentMeeting?.status !== 'held';
  }
}

async function mutation(path, method, body, success, refreshDetail = true) {
  if (busy || loadingDetail) return;
  busy = true;
  updateControls();
  try {
    await api(path, method, body);
    await loadMeetings();
    if (refreshDetail && selectedId) await loadDetail(selectedId);
    message.textContent = success;
  } catch (error) { message.textContent = error.message; }
  finally { busy = false; updateControls(); }
}

async function loadMeetings() {
  const sequence = ++listSequence;
  const { meetings } = await api('');
  if (sequence !== listSequence) return;
  meetingsList.replaceChildren();
  openButtons = [];
  if (!meetings.length) meetingsList.textContent = 'Nenhuma reunião registrada.';
  const labels = { scheduled: 'Agendada', held: 'Realizada', cancelled: 'Cancelada' };
  for (const meeting of meetings) {
    const row = document.createElement('article');
    row.className = 'record-list-item';
    const text = document.createElement('p');
    text.className = 'record-info';
    text.textContent = `Reunião ${meeting.number}\n${meeting.date} às ${meeting.time}\n${meeting.activity}\n${labels[meeting.status]}${meeting.status === 'held' ? ` · Chamada ${meeting.attendanceCompleted ? 'fechada' : 'em aberto'}` : ''}`;
    const actions = document.createElement('div');
    actions.className = 'record-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Abrir chamada';
    open.addEventListener('click', async () => {
      if (busy || loadingDetail) return;
      if (hasUnsavedChanges() && !window.confirm('Há alterações não salvas. Descartar e abrir outra chamada?')) return;
      try { await loadDetail(meeting.id); }
      catch (error) { message.textContent = error.message; }
    });
    openButtons.push(open);
    actions.append(open);
    row.append(text, actions);
    meetingsList.append(row);
  }
  updateControls();
}

function renderMeetingState(meeting) {
  document.querySelector('#detail-title').textContent = `Reunião ${meeting.number} — ${meeting.activity}`;
  document.querySelector('#detail-state').textContent = meeting.attendanceCompleted
    ? 'Chamada fechada. Correções continuam disponíveis: altere os lançamentos e salve a chamada.'
    : 'Chamada em aberto. Salve as marcações e feche quando todos estiverem preenchidos.';
  document.querySelector('#start-meeting').hidden = meeting.status !== 'scheduled';
  document.querySelector('#cancel-meeting').hidden = meeting.status !== 'scheduled';
  document.querySelector('#save-attendance').hidden = meeting.status !== 'held';
  document.querySelector('#complete-meeting').hidden = meeting.status !== 'held' || meeting.attendanceCompleted;
}

async function loadDetail(id) {
  const sequence = ++detailSequence;
  loadingDetail = true;
  updateControls();
  try {
    const { meeting, participants } = await api(`/${id}`);
    if (sequence !== detailSequence) return;
    selectedId = id;
    currentMeeting = meeting;
    draftRows = [];
    detail.hidden = false;
    renderMeetingState(meeting);
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
      const controls = document.createElement('div');
      controls.className = 'record-controls';
      controls.append(select);
      const justification = document.createElement('textarea');
      justification.setAttribute('aria-label', `Justificativa da falta de ${student.name}`);
      justification.setAttribute('placeholder', 'Justificativa da falta (opcional)');
      justification.maxLength = 2000;
      justification.value = student.justification ?? '';
      const block = document.createElement('div');
      block.className = 'record-justification';
      block.hidden = select.value !== 'absent';
      block.append(justification);
      select.addEventListener('change', () => { block.hidden = select.value !== 'absent'; });
      draftRows.push({ id: student.id, select, justification, originalStatus: student.status ?? null,
        originalJustification: student.justification?.trim() || null });
      row.append(name, controls, block);
      attendanceList.append(row);
    }
  } finally {
    if (sequence === detailSequence) { loadingDetail = false; updateControls(); }
  }
}

async function saveAttendance(complete) {
  if (busy || loadingDetail || !selectedId || currentMeeting?.status !== 'held') return;
  const records = recordsFromDraft();
  if (!records.length) { message.textContent = 'Não há participantes nesta chamada.'; return; }
  if ((complete || currentMeeting.attendanceCompleted) && records.some(record => record.status === null)) {
    message.textContent = 'Marque Presente ou Falta para todos os participantes antes de fechar a chamada.';
    return;
  }
  const removesJustification = records.some((record, index) => draftRows[index].originalJustification && record.justification === null);
  const question = complete
    ? `Salvar todas as marcações e fechar a chamada?${removesJustification ? ' Justificativas removidas ou de faltas alteradas também serão apagadas.' : ''}`
    : removesJustification ? 'Salvar a chamada e remover as justificativas apagadas ou de faltas alteradas?' : null;
  if (question && !window.confirm(question)) return;
  const id = selectedId;
  const success = complete ? 'Chamada salva e fechada.' : currentMeeting.attendanceCompleted
    ? 'Correções salvas. A frequência já considera os novos lançamentos.'
    : 'Chamada salva em aberto. Feche a chamada completa para atualizar os percentuais.';
  busy = true;
  updateControls();
  let committed = false;
  try {
    const result = await api(`/${id}/attendance`, 'PUT', { records, complete, ...(complete ? { confirmed: true } : {}) });
    committed = true;
    if (result.meeting) { currentMeeting = result.meeting; renderMeetingState(currentMeeting); }
    records.forEach((record, index) => {
      draftRows[index].originalStatus = record.status;
      draftRows[index].originalJustification = record.justification;
      draftRows[index].justification.value = record.justification ?? '';
    });
    await loadMeetings();
    await loadDetail(id);
    message.textContent = success;
  } catch (error) {
    message.textContent = committed ? `${success} Não foi possível atualizar a tela; recarregue para conferir.` : error.message;
  } finally { busy = false; updateControls(); }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || loadingDetail || !form.reportValidity()) return;
  // Registrar outra reunião não deve recarregar e apagar o rascunho da chamada aberta.
  return mutation('', 'POST', { date: form.elements.date.value, time: form.elements.time.value, activity: form.elements.activity.value }, 'Reunião registrada.', false);
});
for (const [selector, action, question, success] of [
  ['#start-meeting', 'start', 'Iniciar a reunião e fixar a chamada com os alunos ativos?', 'Reunião iniciada. Preencha a chamada.'],
  ['#cancel-meeting', 'cancel', 'Cancelar esta reunião? O número será preservado.', 'Reunião cancelada.'],
]) {
  document.querySelector(selector).addEventListener('click', () => {
    if (!busy && !loadingDetail && selectedId && window.confirm(question)) return mutation(`/${selectedId}/${action}`, 'POST', { confirmed: true }, success);
  });
}
document.querySelector('#save-attendance').addEventListener('click', () => saveAttendance(false));
document.querySelector('#complete-meeting').addEventListener('click', () => saveAttendance(true));
window.addEventListener('beforeunload', event => {
  if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
});
// Habilitar o registro somente depois que os listeners impedem o submit nativo.
updateControls();
loadMeetings().catch(error => { message.textContent = error.message; });
