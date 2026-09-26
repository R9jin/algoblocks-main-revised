// frontend/src/utils/apiError.js

/**
 * Normalizes a parsed FastAPI JSON error body into a single display string.
 *
 * FastAPI's `detail` field is NOT always a string:
 *  - Errors we raise ourselves (`HTTPException(status_code=400, detail="Email
 *    already registered")`) give `detail` as a plain string.
 *  - Pydantic request-body validation failures (422s -- e.g. a signup
 *    password under the model's `min_length=6`, a malformed email, a missing
 *    required field) are serialized by FastAPI as `detail`: an ARRAY of
 *    error objects, each shaped like
 *    `{ type, loc: ["body", "password"], msg: "String should have at least
 *    6 characters", ... }`.
 *
 * Every call site across the app used to do `data.detail || "fallback"`,
 * which assumed the string case. When a 422 came back, that array (being
 * truthy) was passed straight into `showToast()` / `new Error()`, and
 * React can't render an array of objects as text -- the toast broke
 * instead of showing the actual validation message the user needed (e.g.
 * "password must be at least 6 characters"), which is exactly the failure
 * seen in the "password shorter than the minimum length" sign-up test.
 *
 * @param {any} data - Parsed JSON body of a non-OK fetch response.
 * @param {string} fallback - Message to use if nothing usable is found.
 * @returns {string}
 */
export const getErrorMessage = (data, fallback = "Something went wrong. Please try again.") => {
  const detail = data?.detail;

  if (!detail) return fallback;
  if (typeof detail === "string") return detail;

  // FastAPI/Pydantic validation error array.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.msg === "string") {
          // Pydantic v2 prefixes any ValueError raised inside a
          // field_validator (e.g. our password strength check in
          // models.py) with "Value error, " -- strip that boilerplate so
          // the toast reads "Password must include at least one number."
          // instead of "password: Value error, Password must include..."
          const cleanedMsg = item.msg.replace(/^Value error,\s*/i, "");
          // loc is usually ["body", "<field>"] -- surface the field name
          // when present so "String should have at least 6 characters"
          // reads as "password: String should have at least 6 characters".
          const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
          return field && typeof field === "string" ? `${field}: ${cleanedMsg}` : cleanedMsg;
        }
        return null;
      })
      .filter(Boolean);

    return messages.length ? messages.join(" ") : fallback;
  }

  // Unexpected shape (plain object, etc.) -- don't hand a non-string to a
  // renderer or Error(); fall back to something safe to display.
  return fallback;
};
