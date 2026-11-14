export class AttendanceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateFilters(query) {
  if (Object.keys(query).some((key) => !['name', 'registrationNumber', 'date'].includes(key))) {
    throw new AttendanceError(400, 'Filtro não reconhecido.');
  }
  const filters = {};
  for (const [key, limit] of [['name', 200], ['registrationNumber', 64], ['date', 10]]) {
    const value = query[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw new AttendanceError(400, 'Filtro inválido.');
    filters[key] = value.trim();
  }
  if (filters.date && (!/^\d{4}-\d{2}-\d{2}$/.test(filters.date) || filters.date.startsWith('0000')
    || !Number.isFinite(Date.parse(`${filters.date}T00:00:00Z`))
    || new Date(`${filters.date}T00:00:00Z`).toISOString().slice(0, 10) !== filters.date)) {
    throw new AttendanceError(400, 'Informe uma data válida.');
  }
  return filters;
}

export function summarizeAttendance(student) {
  const meetings = student.meetings.filter((meeting) => meeting.countsTowardTotal);
  const totalMeetings = meetings.length;
  const presences = meetings.filter((meeting) => meeting.status === 'present').length;
  const absences = meetings.filter((meeting) => meeting.status === 'absent').length;
  return {
    totalMeetings, presences, absences, pending: totalMeetings - presences - absences,
    presencePercentage: totalMeetings ? presences / totalMeetings * 100 : null,
    absencePercentage: totalMeetings ? absences / totalMeetings * 100 : null,
    basis: student.status === 'dismissed' ? 'included_meetings' : 'all_completed_meetings',
  };
}

const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function createAttendanceService(repository) {
  return {
    async list(query) {
      const filters = validateFilters(query);
      const all = await repository.read();
      const students = all.filter((student) => normalize(student.name).includes(normalize(filters.name))
        && normalize(student.registrationNumber).includes(normalize(filters.registrationNumber))
        && (!filters.date || student.meetings.some((m) => m.date === filters.date && m.included)))
        .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id))
        .map(({ meetings, ...student }) => ({ ...student,
          summary: summarizeAttendance({ ...student, meetings }),
          selectedMeeting: filters.date ? meetings.find((m) => m.date === filters.date && m.included) ?? null : null,
        }));
      return { students, totalStudents: all.length, filters };
    },
    async detail(id) {
      if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) throw new AttendanceError(400, 'Identificador inválido.');
      const [student] = await repository.read(id);
      if (!student) throw new AttendanceError(404, 'Aluno não encontrado.');
      return { student, summary: summarizeAttendance(student) };
    },
  };
}
