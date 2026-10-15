// frontend/src/utils/anonymize.js
//
// The PDF and Excel reports must not carry names or email addresses (the
// Data Privacy Act treats them as personal information). Both exports call
// anonymizeOverview() first and build everything from the copy it returns.
//
// Each respondent gets a stable ID (S01, S02, ...) from their position in
// `by_user`. The backend numbers the regression respondents the same way
// (api/services/regression_service.py), so S07 is the same person in the
// per-respondent tables and in the regression sheets.
//
// The copy keeps the `name` and `email` field names so the report code needs
// no other change, but both now hold the ID. The `email` field doubles as the
// join key between the Submissions, Respondents, Learning Path Detail and
// Pre-Post Test sheets, so it stays consistent across all of them.

export const respondentId = (index) => `S${String(index + 1).padStart(2, "0")}`;

export function anonymizeOverview(ov) {
  if (!ov) return ov;

  const idByEmail = new Map();
  const byUser = Array.isArray(ov.by_user) ? ov.by_user : [];
  byUser.forEach((u, i) => idByEmail.set(u.email, respondentId(i)));

  // A submission whose owner is not in by_user (e.g. removed from the roster)
  // still gets an ID, continuing after the listed respondents.
  const idFor = (email) => {
    if (!idByEmail.has(email)) idByEmail.set(email, respondentId(idByEmail.size));
    return idByEmail.get(email);
  };

  return {
    ...ov,
    by_user: byUser.map((u) => {
      const id = idFor(u.email);
      return { ...u, name: id, email: id };
    }),
    submissions: Array.isArray(ov.submissions)
      ? ov.submissions.map((s) => ({ ...s, email: idFor(s.email) }))
      : ov.submissions,
  };
}
