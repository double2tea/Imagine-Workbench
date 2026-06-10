export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export function badRequest(message: string, code = "bad_request", details?: unknown): ApiError {
  return new ApiError(400, code, message, details);
}

export function apiErrorResponse(error: unknown, fallbackMessage: string): {
  body: ApiErrorResponse;
  status: number;
} {
  if (error instanceof ApiError) {
    return {
      body: error.details === undefined
        ? { error: error.message, code: error.code }
        : { error: error.message, code: error.code, details: error.details },
      status: error.status,
    };
  }

  return {
    body: {
      error: error instanceof Error && error.message.trim() ? error.message : fallbackMessage,
      code: "internal_error",
    },
    status: 500,
  };
}

export function requireApiText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${name} is required`, "missing_required_field");
  }
  return value.trim();
}
