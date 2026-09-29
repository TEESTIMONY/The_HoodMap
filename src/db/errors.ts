/**
 * Classifies "the database went away / is busy" errors — the ones that are
 * worth waiting out and retrying (an RDS restart, a failover, a dropped
 * connection, a statement timeout) — as opposed to bugs like a constraint
 * violation or a syntax error, which retrying can never fix.
 */

const TRANSIENT_CODES = new Set([
  // Postgres SQLSTATE
  "57P01", // admin_shutdown (server is shutting down / terminating the connection)
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now (starting up / in recovery)
  "57014", // query_canceled — includes statement_timeout
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  // Node socket errors
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

// node-postgres surfaces most connection drops as plain Errors with no code.
const TRANSIENT_MESSAGE =
  /connection terminated|terminating connection|server closed the connection|connection (?:reset|refused|closed|lost)|timeout exceeded when trying to connect|query read timeout|the database system is (?:starting up|shutting down|in recovery mode)|client has encountered a connection error|canceling statement due to (?:statement )?timeout/i;

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && TRANSIENT_MESSAGE.test(message);
}
