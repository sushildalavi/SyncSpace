import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthContext, AuthenticatedUser } from "../auth/session.guard.js";

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
  return context.switchToHttp().getRequest<{ auth?: AuthContext }>().auth?.user;
});
