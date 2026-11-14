import { MeetingError } from '../services/meeting-service.js';

const fields = `id::text AS id, number::text AS number, to_char(meeting_date, 'YYYY-MM-DD') AS date,
  to_char(meeting_time, 'HH24:MI') AS time, activity, status, attendance_completed AS "attendanceCompleted"`;

export function createMeetingRepository(pool, timeZone) {
  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function lockedMeeting(client, id) {
    const row = (await client.query(`SELECT ${fields},
      (meeting_date + meeting_time <= CURRENT_TIMESTAMP AT TIME ZONE $2) AS due
      FROM meetings WHERE id = $1 FOR UPDATE`, [id, timeZone])).rows[0];
    if (!row) throw new MeetingError(404, 'Reunião não encontrada.');
    return row;
  }
  function requireHeld(meeting) {
    if (meeting.status !== 'held' || !meeting.due) throw new MeetingError(409, 'A reunião precisa estar realizada para lançar a chamada.');
  }
  async function requireParticipant(client, id, studentId) {
    if (!(await client.query('SELECT 1 FROM meeting_participants WHERE meeting_id = $1 AND student_id = $2', [id, studentId])).rows.length) {
      throw new MeetingError(404, 'Aluno não pertence à chamada desta reunião.');
    }
  }
  return {
    async list() { return { meetings: (await pool.query(`SELECT ${fields} FROM meetings ORDER BY number DESC`)).rows }; },
    async add(data) {
      return { meeting: (await pool.query(`INSERT INTO meetings (meeting_date, meeting_time, activity)
        VALUES ($1, $2, $3) RETURNING ${fields}`, [data.date, data.time, data.activity])).rows[0] };
    },
    async get(id) {
      const meeting = (await pool.query(`SELECT ${fields} FROM meetings WHERE id = $1`, [id])).rows[0];
      if (!meeting) throw new MeetingError(404, 'Reunião não encontrada.');
      const participants = (await pool.query(`SELECT s.id::text AS id, s.name,
        s.registration_number AS "registrationNumber", s.status AS "studentStatus", a.status, a.justification
        FROM meeting_participants p JOIN students s ON s.id = p.student_id
        LEFT JOIN attendance a ON a.student_id = p.student_id AND a.meeting_id = p.meeting_id
        WHERE p.meeting_id = $1 ORDER BY s.name, s.id`, [id])).rows;
      return { meeting, participants };
    },
    start(id) {
      return transaction(async (client) => {
        // Mesma ordem do cadastro: reuniões antes de alunos. Estabiliza a lista
        // contra inclusões e desligamentos enquanto a chamada é iniciada.
        await client.query('LOCK TABLE meetings IN SHARE ROW EXCLUSIVE MODE');
        await client.query('LOCK TABLE students IN SHARE MODE');
        const meeting = await lockedMeeting(client, id);
        if (meeting.status !== 'scheduled') throw new MeetingError(409, 'Somente reunião agendada pode ser iniciada.');
        if (!meeting.due) throw new MeetingError(409, 'Não é possível iniciar uma reunião futura.');
        const result = await client.query(`INSERT INTO meeting_participants (meeting_id, student_id)
          SELECT $1, id FROM students WHERE status = 'active' RETURNING student_id`, [id]);
        if (!result.rows.length) throw new MeetingError(409, 'Não há alunos ativos para iniciar a chamada.');
        return { meeting: (await client.query(`UPDATE meetings SET status = 'held' WHERE id = $1 RETURNING ${fields}`, [id])).rows[0] };
      });
    },
    cancel(id) {
      return transaction(async (client) => {
        const meeting = await lockedMeeting(client, id);
        if (meeting.status !== 'scheduled') throw new MeetingError(409, 'Somente reunião agendada pode ser cancelada.');
        return { meeting: (await client.query(`UPDATE meetings SET status = 'cancelled' WHERE id = $1 RETURNING ${fields}`, [id])).rows[0] };
      });
    },
    attendance(id, studentId, status) {
      return transaction(async (client) => {
        requireHeld(await lockedMeeting(client, id));
        await requireParticipant(client, id, studentId);
        await client.query(`INSERT INTO attendance (meeting_id, student_id, status) VALUES ($1, $2, $3)
          ON CONFLICT (student_id, meeting_id) DO UPDATE SET status = EXCLUDED.status,
          justification = CASE WHEN EXCLUDED.status = 'present' THEN NULL ELSE attendance.justification END`, [id, studentId, status]);
        return { saved: true };
      });
    },
    saveAttendance(id, records, complete) {
      return transaction(async client => {
        const meeting = await lockedMeeting(client, id);
        requireHeld(meeting);
        const participants = (await client.query('SELECT student_id::text AS id FROM meeting_participants WHERE meeting_id = $1', [id])).rows;
        const expected = new Set(participants.map(participant => participant.id));
        if (records.some(record => !expected.has(record.studentId))) throw new MeetingError(404, 'Aluno não pertence à chamada desta reunião.');
        if (!participants.length || records.length !== participants.length) throw new MeetingError(409, 'Envie todos os participantes da chamada. Reabra a reunião e tente novamente.');
        if ((complete || meeting.attendanceCompleted) && records.some(record => record.status === null)) {
          throw new MeetingError(409, 'Marque Presente ou Falta para todos os participantes antes de fechar a chamada.');
        }
        const data = JSON.stringify(records);
        // Pendência continua sendo ausência de registro, sem falta automática.
        await client.query(`DELETE FROM attendance a USING
          jsonb_to_recordset($2::jsonb) AS r("studentId" bigint, status text, justification text)
          WHERE a.meeting_id = $1 AND a.student_id = r."studentId" AND r.status IS NULL`, [id, data]);
        await client.query(`INSERT INTO attendance (student_id, meeting_id, status, justification)
          SELECT r."studentId", $1::bigint, r.status, r.justification
          FROM jsonb_to_recordset($2::jsonb) AS r("studentId" bigint, status text, justification text)
          WHERE r.status IS NOT NULL
          ON CONFLICT (student_id, meeting_id) DO UPDATE SET status = EXCLUDED.status, justification = EXCLUDED.justification`, [id, data]);
        const result = await client.query(`UPDATE meetings SET attendance_completed = attendance_completed OR $2
          WHERE id = $1 RETURNING ${fields}`, [id, complete]);
        return { saved: true, meeting: result.rows[0] };
      });
    },
    justify(id, studentId, justification) {
      return transaction(async (client) => {
        requireHeld(await lockedMeeting(client, id));
        await requireParticipant(client, id, studentId);
        const result = await client.query(`UPDATE attendance SET justification = $3
          WHERE meeting_id = $1 AND student_id = $2 AND status = 'absent' RETURNING student_id`, [id, studentId, justification]);
        if (!result.rows.length) throw new MeetingError(409, 'Somente uma falta já lançada pode ser justificada.');
        return { saved: true };
      });
    },
    complete(id) {
      return transaction(async (client) => {
        const meeting = await lockedMeeting(client, id);
        requireHeld(meeting);
        if (meeting.attendanceCompleted) throw new MeetingError(409, 'A chamada já está concluída.');
        const counts = (await client.query(`SELECT count(*)::int AS total,
          count(a.status)::int AS recorded FROM meeting_participants p LEFT JOIN attendance a
          ON a.meeting_id = p.meeting_id AND a.student_id = p.student_id WHERE p.meeting_id = $1`, [id])).rows[0];
        if (!counts.total || counts.recorded !== counts.total) throw new MeetingError(409, 'Lance presença ou falta para todos os participantes antes de concluir.');
        return { meeting: (await client.query(`UPDATE meetings SET attendance_completed = true WHERE id = $1 RETURNING ${fields}`, [id])).rows[0] };
      });
    },
  };
}
