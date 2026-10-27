/** Exam dates remain calendar strings at every API boundary, without time zones. */
export function feedbackExamDetails(ticket: { source: string; examDate?: string | null; examCenter?: string | null }) {
  return ticket.source === 'exam_report' ? {
    ...(ticket.examDate ? { examDate: ticket.examDate } : {}),
    ...(ticket.examCenter ? { examCenter: ticket.examCenter } : {}),
  } : {};
}
