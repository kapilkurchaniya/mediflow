/**
 * Turns the result of a next-safe-action call into one error string (or null when it succeeded).
 * Safe for client components.
 *
 *   const res = await createRack(input);
 *   const err = actionError(res);
 *   if (err) return setError(err);
 *   use(res.data!)
 */
export function actionError(res: { serverError?: string; validationErrors?: unknown } | undefined): string | null {
  if (!res) return null;
  if (res.serverError) return res.serverError;
  return res.validationErrors ? firstValidationMessage(res.validationErrors) ?? "Please check the form and try again." : null;
}

function firstValidationMessage(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const errs = (node as { _errors?: unknown })._errors;
  if (Array.isArray(errs) && typeof errs[0] === "string") return errs[0];
  for (const child of Object.values(node)) {
    const m = firstValidationMessage(child);
    if (m) return m;
  }
  return null;
}
