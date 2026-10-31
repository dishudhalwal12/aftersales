/**
 * Turns a Prisma connectivity/schema failure into something a person can act on.
 *
 * A fresh deployment meets two failure modes that look identical to a user and
 * need opposite fixes: "the connection string is wrong" and "the tables were
 * never created" (both the operator's problem) versus "your password is wrong"
 * (the user's). A bare 500 collapses them into "something broke", which is the
 * failure state this project must not ship — so both are classified by their
 * real shapes and reported honestly.
 *
 * The shapes are measured, not assumed: a wrong password and an unreachable host
 * both raise `PrismaClientInitializationError` with NO `code` (only `name`,
 * `clientVersion`, `retryable`), while schema drift raises a known-request error
 * that does carry one. Classifying by `code` alone silently misses credentials.
 */

/** Query-level codes: the schema in the database is behind the code. */
const SCHEMA_CODES = new Set([
  "P2021", // the table does not exist — `prisma db push` never ran
  "P2022", // the column does not exist
]);

/**
 * Shown in the form when the database is not usable. Says what the person can
 * rely on (nothing was saved) instead of inventing a credentials error.
 */
export const DATABASE_UNAVAILABLE_MESSAGE =
  "The database is not connected yet, so sign-in cannot be completed. Nothing was saved — please try again shortly.";

/**
 * True when the error is about the database's availability or shape rather than
 * the request. Deliberately narrow: an error that is neither an initialisation
 * failure nor an observed schema code (a bug in our own query) keeps bubbling up
 * as a real 500 instead of being disguised as infrastructure trouble.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const name = (error as { name?: unknown }).name;
  if (name === "PrismaClientInitializationError") return true;

  const code =
    (error as { code?: unknown }).code ?? (error as { errorCode?: unknown }).errorCode;
  return typeof code === "string" && SCHEMA_CODES.has(code);
}

/**
 * Runs a database-backed lookup and answers with `fallback` when the database
 * itself is unusable, so a sleeping project degrades one screen instead of
 * replacing it with a stack trace.
 *
 * Only availability failures are absorbed. A bug in our own query still throws:
 * disguising it as infrastructure would make a real defect read as an outage and
 * send the next person to the hosting dashboard for nothing.
 */
export async function withDatabaseFallback<T>(
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    console.error("[db] database unavailable:", error);
    return fallback;
  }
}
