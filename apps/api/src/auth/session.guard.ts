import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { AUTH } from "./auth.constants.js";
import type { Auth } from "./auth.factory.js";
import { IS_PUBLIC } from "./public.decorator.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
};
export type AuthContext = { user: AuthenticatedUser; sessionId: string };

export async function resolveSession(auth: Auth, headers: IncomingHttpHeaders): Promise<AuthContext | null> {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  if (!result) {
    return null;
  }
  return {
    sessionId: result.session.id,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      emailVerified: result.user.emailVerified,
      image: result.user.image ?? null
    }
  };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(Reflector) private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ headers: IncomingHttpHeaders; auth?: AuthContext }>();
    const session = await resolveSession(this.auth, request.headers);
    if (!session) {
      throw new UnauthorizedException("Sign in to continue");
    }
    request.auth = session;
    return true;
  }
}
