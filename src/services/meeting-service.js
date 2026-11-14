export class MeetingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function bodyFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new MeetingError(400, 'Dados da requisição inválidos.');
  }
}

export function meetingId(value) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new MeetingError(400, 'Identificador inválido.');
  }
  return value;
}

export function validateMeeting(body) {
  bodyFields(body, ['date', 'time', 'activity']);
  const { date, time, activity } = body;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')
    || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new MeetingError(400, 'Informe uma data válida no formato AAAA-MM-DD.');
  }
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new MeetingError(400, 'Informe um horário válido no formato HH:MM.');
  }
  if (typeof activity !== 'string' || !activity.trim() || activity.trim().length > 500) {
    throw new MeetingError(400, 'Informe a atividade, com até 500 caracteres.');
  }
  return { date, time, activity: activity.trim() };
}

function confirmed(body) {
  bodyFields(body, ['confirmed']);
  if (body.confirmed !== true) throw new MeetingError(400, 'Confirme a operação.');
}

export function createMeetingService(repository) {
  return {
    list: () => repository.list(),
    add: (body) => repository.add(validateMeeting(body)),
    get: (id) => repository.get(meetingId(id)),
    start(id, body) { meetingId(id); confirmed(body); return repository.start(id); },
    cancel(id, body) { meetingId(id); confirmed(body); return repository.cancel(id); },
    complete(id, body) { meetingId(id); confirmed(body); return repository.complete(id); },
    saveAttendance(id, body) {
      meetingId(id);
      bodyFields(body, ['records', 'complete', 'confirmed']);
      if (typeof body.complete !== 'boolean' || (body.complete && body.confirmed !== true)
        || !Array.isArray(body.records) || !body.records.length || body.records.length > 1000) {
        throw new MeetingError(400, 'Envie os participantes da chamada e confirme sua conclusão quando necessário.');
      }
      const ids = new Set();
      const records = body.records.map(record => {
        bodyFields(record, ['studentId', 'status', 'justification']);
        if (typeof record.studentId !== 'string') throw new MeetingError(400, 'Identificador de aluno inválido.');
        meetingId(record.studentId);
        if (ids.has(record.studentId)) throw new MeetingError(400, 'Aluno repetido na chamada.');
        ids.add(record.studentId);
        if (![null, 'present', 'absent'].includes(record.status)) throw new MeetingError(400, 'Informe presença, falta ou pendência.');
        const text = record.justification;
        if (text !== undefined && text !== null && (typeof text !== 'string' || !text.trim() || text.trim().length > 2000)) {
          throw new MeetingError(400, 'Informe justificativa válida de até 2000 caracteres ou null para removê-la.');
        }
        if (text != null && record.status !== 'absent') throw new MeetingError(400, 'Somente faltas podem ter justificativa.');
        return { studentId: record.studentId, status: record.status, justification: text?.trim() ?? null };
      });
      return repository.saveAttendance(id, records, body.complete);
    },
    attendance(id, studentId, body) {
      meetingId(id); meetingId(studentId);
      bodyFields(body, ['status']);
      if (!['present', 'absent'].includes(body.status)) throw new MeetingError(400, 'Informe presença ou falta.');
      return repository.attendance(id, studentId, body.status);
    },
    justify(id, studentId, body) {
      meetingId(id); meetingId(studentId);
      bodyFields(body, ['justification']);
      if (body.justification !== null && (typeof body.justification !== 'string'
        || !body.justification.trim() || body.justification.trim().length > 2000)) {
        throw new MeetingError(400, 'Informe a justificativa com até 2000 caracteres, ou null para removê-la.');
      }
      return repository.justify(id, studentId, body.justification?.trim() ?? null);
    },
  };
}
