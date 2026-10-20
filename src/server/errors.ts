/**
 * Errors that carry a stable `code` and a message that is safe to show to the user.
 * Actions map these to friendly messages; anything else is treated as an unexpected failure.
 * (Extended with ForbiddenError in Roadmap A1.1.)
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
