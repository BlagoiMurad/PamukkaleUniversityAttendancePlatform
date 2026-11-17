import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Stable, machine-readable error codes (spec 8 "стабилен error code", 19.3).
 * The frontend maps every code to a human message; never rely on the message text.
 */
export const ErrorCodes = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  LOGIN_REQUIRED: HttpStatus.UNAUTHORIZED,
  TOKEN_EXPIRED: HttpStatus.UNAUTHORIZED,
  SESSION_REVOKED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  ACCOUNT_LOCKED: HttpStatus.TOO_MANY_REQUESTS,
  ACCOUNT_DISABLED: HttpStatus.FORBIDDEN,
  TEMP_PASSWORD_EXPIRED: HttpStatus.UNAUTHORIZED,
  PASSWORD_CHANGE_REQUIRED: HttpStatus.FORBIDDEN,
  WEAK_PASSWORD: HttpStatus.BAD_REQUEST,
  MFA_REQUIRED: HttpStatus.UNAUTHORIZED,
  MFA_INVALID: HttpStatus.UNAUTHORIZED,
  TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  CSRF_FAILED: HttpStatus.FORBIDDEN,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_IN_PROGRESS: HttpStatus.CONFLICT,
  IDEMPOTENCY_KEY_REUSED: HttpStatus.UNPROCESSABLE_ENTITY,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  // Lessons
  LESSON_NOT_FOUND: HttpStatus.NOT_FOUND,
  LESSON_NOT_ACTIVE: HttpStatus.CONFLICT,
  LESSON_ENDED: HttpStatus.GONE,
  LESSON_NOT_STARTED: HttpStatus.CONFLICT,
  LESSON_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  LESSON_LOCKED: HttpStatus.CONFLICT,
  INVALID_TRANSITION: HttpStatus.CONFLICT,
  JOIN_TOKEN_INVALID: HttpStatus.NOT_FOUND,
  // Attendance
  STUDENT_NOT_ENROLLED: HttpStatus.FORBIDDEN,
  ENROLLMENT_REVOKED: HttpStatus.FORBIDDEN,
  STUDENT_REMOVED: HttpStatus.FORBIDDEN,
  CHALLENGE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CHALLENGE_EXPIRED: HttpStatus.GONE,
  CHALLENGE_USED: HttpStatus.CONFLICT,
  CHALLENGE_REVOKED: HttpStatus.GONE,
  CHALLENGE_ATTEMPTS_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
  MARKER_FAMILY_UNSUPPORTED: HttpStatus.BAD_REQUEST,
  MARKER_EXPIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  MARKER_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECKIN_CLOSED: HttpStatus.GONE,
  REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  // Import / reports
  IMPORT_INVALID_FILE: HttpStatus.BAD_REQUEST,
  IMPORT_ALREADY_COMMITTED: HttpStatus.CONFLICT,
  REPORT_RANGE_TOO_LARGE: HttpStatus.BAD_REQUEST,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message: message ?? code, details }, ErrorCodes[code]);
  }
}
