export type AppErrorCode =
  | "forbidden"
  | "network"
  | "validation"
  | "notFound"
  | "conflict"
  | "unknown";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof TypeError) {
    return new AppError(
      "network",
      "Network error. Check your connection and try again.",
    );
  }

  if (typeof err === "object" && err !== null) {
    const { code, message } = err as SupabaseLikeError;
    const text = typeof message === "string" ? message : "";
    const sqlstate = typeof code === "string" ? code : "";

    if (sqlstate === "42501" || /row-level security/i.test(text)) {
      return new AppError(
        "forbidden",
        "You do not have permission to do this.",
      );
    }
    if (sqlstate === "23505") {
      return new AppError(
        "validation",
        "A record with these details already exists.",
      );
    }
    if (sqlstate === "23503") {
      return new AppError(
        "validation",
        "This record references something that does not exist.",
      );
    }
    // S-51: the v3 functions raise these with user-safe messages, so the
    // database text is shown verbatim. 22001 must be matched before the
    // generic 22*/23* fallback below, which would drop the message.
    if (sqlstate === "22001") {
      return new AppError("validation", message || "Some of the information entered is not valid.");
    }
    if (sqlstate === "P0002") {
      return new AppError(
        "notFound",
        message || "That item no longer exists.",
      );
    }
    if (sqlstate === "55000") {
      return new AppError("conflict", message || "That change conflicts with the current state.");
    }
    if (sqlstate.startsWith("22") || sqlstate.startsWith("23")) {
      return new AppError(
        "validation",
        "Some of the information entered is not valid.",
      );
    }
    if (sqlstate.startsWith("PGRST")) {
      return new AppError(
        "unknown",
        "Could not complete the request. Please try again.",
      );
    }
  }

  return new AppError("unknown", "Something went wrong. Please try again.");
}
