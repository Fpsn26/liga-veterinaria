export function createAttendanceRepository(pool, timeZone) {
  return {
    async read(studentId = null) {
      // Uma única consulta mantém dados e totais no mesmo snapshot do banco.
      const result = await pool.query(`
        SELECT s.id::text AS id, s.name, s.registration_number AS "registrationNumber", s.status,
          COALESCE(jsonb_agg(jsonb_build_object(
            'id', m.id::text, 'number', m.number::text,
            'date', to_char(m.meeting_date, 'YYYY-MM-DD'), 'time', to_char(m.meeting_time, 'HH24:MI'),
            'activity', m.activity, 'meetingStatus', m.status, 'attendanceCompleted', m.attendance_completed,
            'included', p.student_id IS NOT NULL, 'status', a.status, 'justification', a.justification,
            'countsTowardTotal', m.status = 'held' AND m.attendance_completed
              AND m.meeting_date + m.meeting_time <= CURRENT_TIMESTAMP AT TIME ZONE $2
              AND (s.status = 'active' OR p.student_id IS NOT NULL)
          ) ORDER BY m.meeting_date DESC, m.number DESC) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS meetings
        FROM students s
        LEFT JOIN meetings m ON s.status = 'active' OR EXISTS (
          SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.student_id = s.id
        )
        LEFT JOIN meeting_participants p ON p.meeting_id = m.id AND p.student_id = s.id
        LEFT JOIN attendance a ON a.meeting_id = m.id AND a.student_id = s.id
        WHERE ($1::bigint IS NULL OR s.id = $1::bigint)
        GROUP BY s.id
      `, [studentId, timeZone]);
      return result.rows;
    },
  };
}
