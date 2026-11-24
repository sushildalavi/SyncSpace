import type { NextFunction, Request, Response } from "express";

/**
 * CSRF defence for cookie sessions: state-changing requests must come from the web origin.
 * SameSite=Lax cookies already block cross-site POSTs; this is the second layer.
 */
export function originCheck(allowedOrigin: string) {
  const allowed = new URL(allowedOrigin).origin;
  return (request: Request, response: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      next();
      return;
    }
    const origin = request.headers.origin;
    if (origin === allowed) {
      next();
      return;
    }
    response.status(403).json({ statusCode: 403, message: "Cross-origin request blocked" });
  };
}
