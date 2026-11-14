const message = document.querySelector('#session-message');
const attendanceMessage = document.querySelector('#attendance-message');
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentage = (value) => value === null ? '—' : `${percentFormatter.format(value)}%`;
let filterSequence = 0;
let detailSequence = 0;

async function getAttendance(path) {
  const response = await fetch(path);
  if (response.status === 401) {
    location.replace('/pages/login.html');
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a frequência.');
  return data;
}

function statusLabel(meeting) {
  if (meeting.meetingStatus === 'cancelled') return 'Cancelada';
  if (meeting.meetingStatus === 'scheduled') return 'Agendada';
  const status = meeting.status === 'present' ? 'Presente' : meeting.status === 'absent' ? 'Falta' : 'Pendente';
  return meeting.attendanceCompleted ? status : `${status} · chamada em aberto`;
}

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = String(value);
  row.append(td);
  return td;
}

function renderHistory({ student, summary }, admin = false) {
  document.querySelector('#student-attendance').hidden = false;
  document.querySelector('#student-title').textContent = admin ? 'Histórico do aluno' : 'Minha frequência';
  document.querySelector('#attendance-identity').textContent = `${student.name} · Matrícula ${student.registrationNumber}${student.status === 'dismissed' ? ' · Desligado' : ''}`;
  document.querySelector('#attendance-summary').textContent = summary.totalMeetings
    ? `${summary.presences} presenças · ${summary.absences} faltas · ${summary.totalMeetings} reuniões consideradas · Presença: ${percentage(summary.presencePercentage)} · Faltas: ${percentage(summary.absencePercentage)}${summary.pending ? ` · ${summary.pending} lançamentos pendentes: confira a chamada` : ''}`
    : 'Sem reuniões realizadas com chamada concluída. Os percentuais ainda não estão disponíveis.';
  const progress = document.querySelector('#presence-progress');
  progress.hidden = !summary.totalMeetings;
  progress.value = summary.presencePercentage ?? 0;
  progress.setAttribute('aria-label', `Presença: ${percentage(summary.presencePercentage)}`);
  document.querySelector('#attendance-basis').textContent = summary.basis === 'included_meetings'
    ? 'Base: reuniões realizadas com chamada concluída em que este aluno foi incluído. Reuniões posteriores ao desligamento não entram no percentual.'
    : 'Base: todas as reuniões realizadas com chamada concluída. Faltas justificadas continuam contando como faltas.';
  const rows = document.querySelector('#history-rows');
  rows.replaceChildren();
  for (const meeting of student.meetings) {
    const row = document.createElement('tr');
    cell(row, meeting.date.split('-').reverse().join('/'));
    cell(row, meeting.number);
    cell(row, meeting.activity);
    cell(row, statusLabel(meeting));
    cell(row, meeting.justification ?? '—');
    cell(row, meeting.countsTowardTotal ? 'Sim' : 'Não');
    rows.append(row);
  }
  if (!student.meetings.length) {
    const row = document.createElement('tr');
    const empty = cell(row, 'Nenhuma reunião registrada para este aluno.');
    empty.colSpan = 6;
    rows.append(row);
  }
}

async function loadAdminAttendance() {
  const sequence = ++filterSequence;
  detailSequence++;
  document.querySelector('#student-attendance').hidden = true;
  attendanceMessage.textContent = 'Consultando frequência…';
  const form = document.querySelector('#attendance-filters');
  const query = new URLSearchParams({ name: form.elements.name.value, registrationNumber: form.elements.registrationNumber.value, date: form.elements.date.value });
  const data = await getAttendance(`/api/admin/attendance?${query}`);
  if (sequence !== filterSequence) return;
  attendanceMessage.textContent = '';
  document.querySelector('#attendance-count').textContent = `Exibindo ${data.students.length} de ${data.totalStudents} alunos.`;
  const rows = document.querySelector('#attendance-rows');
  rows.replaceChildren();
  for (const student of data.students) {
    const row = document.createElement('tr');
    cell(row, student.name);
    cell(row, student.registrationNumber);
    cell(row, student.status === 'active' ? 'Ativo' : 'Desligado');
    cell(row, student.summary.pending ? `${student.summary.totalMeetings} (${student.summary.pending} lançamentos pendentes)` : student.summary.totalMeetings);
    cell(row, student.summary.presences);
    cell(row, student.summary.absences);
    cell(row, percentage(student.summary.presencePercentage));
    cell(row, percentage(student.summary.absencePercentage));
    cell(row, student.selectedMeeting ? `${statusLabel(student.selectedMeeting)}${student.selectedMeeting.justification ? ` · ${student.selectedMeeting.justification}` : ''}` : '—');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Ver histórico';
    button.setAttribute('aria-label', `Ver histórico de ${student.name}`);
    button.addEventListener('click', async () => {
      const requestSequence = ++detailSequence;
      try {
        const detail = await getAttendance(`/api/admin/attendance/${student.id}`);
        if (requestSequence !== detailSequence) return;
        renderHistory(detail, true);
        attendanceMessage.textContent = '';
      } catch (error) { if (requestSequence === detailSequence) attendanceMessage.textContent = error.message; }
    });
    const actions = document.createElement('td');
    actions.append(button);
    row.append(actions);
    rows.append(row);
  }
  if (!data.students.length) {
    const row = document.createElement('tr');
    cell(row, 'Nenhum aluno encontrado. Reuniões sem chamada iniciada ainda não possuem participantes para o filtro por dia.').colSpan = 10;
    rows.append(row);
  }
}

async function loadSession() {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) return location.replace('/pages/login.html');
  if (!response.ok) throw new Error('Não foi possível consultar a sessão.');
  const { user } = await response.json();
  message.textContent = `${user.name} — ${user.role === 'admin' ? 'Administrador' : 'Aluno'}`;
  document.querySelector('#manage-students').hidden = user.role !== 'admin';
  document.querySelector('#manage-meetings').hidden = user.role !== 'admin';
  if (user.role === 'admin') {
    document.querySelector('#admin-attendance').hidden = false;
    await loadAdminAttendance();
  } else {
    renderHistory(await getAttendance('/api/attendance/me'));
  }
}
loadSession().catch((error) => { attendanceMessage.textContent = error.message; });

document.querySelector('#attendance-filters').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  loadAdminAttendance().catch((error) => { attendanceMessage.textContent = error.message; });
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  document.querySelector('#attendance-filters').reset();
  loadAdminAttendance().catch((error) => { attendanceMessage.textContent = error.message; });
});

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/csrf');
    if (!response.ok) throw new Error('Não foi possível encerrar a sessão.');
    const { csrfToken } = await response.json();
    const logout = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
    if (!logout.ok && logout.status !== 401) throw new Error('Não foi possível encerrar a sessão.');
    location.replace('/pages/login.html');
  } catch (error) { message.textContent = error.message; }
});
