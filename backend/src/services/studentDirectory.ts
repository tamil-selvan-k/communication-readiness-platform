/**
 * Student summary rows shared by the staff portals (mentor, admin, counsellor).
 * One row per student with profile, org placement, current resume, mentor
 * sign-off, readiness score and credit balance.
 */

export const STUDENT_SUMMARY_SELECT = `
  SELECT s.id, s.user_id, s.roll_number, s.coding_handles,
         b.program_id, s.batch_id, s.subdivision_id,
         u.name, u.email, u.status,
         p.name   AS program_name,
         b.name   AS batch_name,
         b.year   AS batch_year,
         sub.name AS subdivision_name,
         d.name   AS department_name,
         r.file_name  AS resume_file_name,
         r.object_key AS resume_url,
         r.parsed_data AS resume_parsed_data,
         EXISTS (
           SELECT 1 FROM placement.mentor_verifications mv
           WHERE mv.student_id = s.id AND mv.verification_type = 'PROFILE' AND mv.status = 'VERIFIED'
         ) AS resume_verified,
         pp.overall_score,
         pp.trend,
         COALESCE(pp.assessment_count, 0) AS assessment_count,
         ca.balance AS credit_balance,
         LEAST(5, FLOOR(COALESCE(ca.balance, 0) / NULLIF((
           SELECT consume_amount FROM credit.credit_policies
           WHERE scope_type = 'GLOBAL' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1
         ), 0)))::int AS coins,
         mentor.name  AS mentor_name,
         mentor.email AS mentor_email
  FROM org.students s
  JOIN identity.users u ON u.id = s.user_id
  LEFT JOIN org.batches b       ON b.id = s.batch_id
  LEFT JOIN org.programs p      ON p.id = b.program_id
  LEFT JOIN org.subdivisions sub ON sub.id = s.subdivision_id
  LEFT JOIN org.departments d   ON d.id = u.department_id
  LEFT JOIN org.resumes r       ON r.student_id = s.id AND r.is_current = true
  LEFT JOIN performance.performance_profiles pp ON pp.student_id = s.id
  LEFT JOIN credit.credit_accounts ca ON ca.student_id = s.id
  LEFT JOIN org.student_mentor_assignments active_sma
         ON active_sma.student_id = s.id AND active_sma.is_active = true
  LEFT JOIN identity.users mentor ON mentor.id = active_sma.mentor_user_id`;
