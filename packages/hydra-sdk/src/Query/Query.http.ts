import { Schema } from "effect";

/**
 * Appends cause message to a label when the cause is an Error.
 * Used for HTTP and decode error messages.
 */
export const withCause = (msg: string, cause: unknown): string =>
  cause instanceof Error ? `${msg}: ${cause.message}` : msg;

/**
 * Promise-based GET + JSON decode using globalThis.fetch.
 * Use when not running inside Effect (e.g. Promise API). Caller supplies
 * an error factory so this module stays free of domain errors (e.g. QueryError).
 */
export async function fetchJson<T, E extends Error>(
  url: string,
  schema: Schema.Schema<T>,
  errorLabel: string,
  makeError: (message: string, cause?: unknown) => E,
): Promise<T> {
  let res: Response | undefined;
  try {
    res = await globalThis.fetch(url);
  } catch (e) {
    throw makeError(withCause(errorLabel, e), e);
  }
  if (res == null) {
    throw makeError(`${errorLabel} (fetch did not return a Response)`, res);
  }
  if (typeof res.ok !== "boolean") {
    throw makeError(withCause(`${errorLabel} (invalid Response object)`, res), res);
  }
  if (!res.ok) {
    throw makeError(
      `${errorLabel}: ${res.status} ${res.statusText}`,
      new Error(`${res.status} ${res.statusText}`),
    );
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw makeError(withCause(`${errorLabel} (invalid JSON)`, e), e);
  }
  try {
    return Schema.decodeUnknownSync(schema)(body) as T;
  } catch (e) {
    const detail =
      e && typeof (e as { message?: string }).message === "string"
        ? (e as { message: string }).message
        : e && Array.isArray((e as unknown as { errors?: unknown }).errors)
          ? JSON.stringify((e as unknown as { errors: unknown }).errors)
          : String(e);
    throw makeError(`${errorLabel} (decode): ${detail}`, e);
  }
}
