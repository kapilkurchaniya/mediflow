/**
 * Errors that carry a stable `code` and a message that is safe to show to the user.
 * Actions map these to friendly messages (see src/server/action.ts); anything else is treated as an
 * unexpected failure and replaced by a generic message.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** The caller is signed in but may not do this. */
export class ForbiddenError extends DomainError {
  constructor(public readonly permission: string) {
    super("FORBIDDEN", `You don't have permission to do this (requires "${permission}").`);
    this.name = "ForbiddenError";
  }
}

/** The requested entity does not exist or does not belong to this tenant. */
export class NotFoundError extends DomainError {
  constructor(message: string = "Resource not found") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}
