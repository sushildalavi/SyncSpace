import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { APP_ENV } from "../shared/app-env.js";
import { Inject } from "@nestjs/common";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: { JWT_SECRET: string }) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = jwt.verify(token, this.env.JWT_SECRET) as { id: string; email: string; displayName: string };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }

  private extractToken(header: string | undefined): string | null {
    if (!header) {
      return null;
    }
    const [scheme, token] = header.split(" ");
    return scheme?.toLowerCase() === "bearer" ? token ?? null : null;
  }
}
