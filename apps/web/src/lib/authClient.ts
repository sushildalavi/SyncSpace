import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_BASE_URL } from "./env";

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [twoFactorClient()]
});

export const { useSession } = authClient;

/** Turns Better Auth error codes into messages a person can act on. */
export function authErrorMessage(error: { code?: string | undefined; message?: string | undefined; status?: number } | null | undefined): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Check them and try again.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email address first. We've sent you a fresh link.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with that email already exists. Try signing in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 10 characters for your password.";
    case "INVALID_PASSWORD":
      return "Your current password is incorrect.";
    case "INVALID_CODE":
      return "That code isn't right. Check your authenticator app and try the newest code.";
    case "INVALID_BACKUP_CODE":
      return "That backup code isn't valid. Each one works only once.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in timed out. Go back and sign in again.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many wrong codes. Go back and sign in again.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many wrong codes. Wait 15 minutes and try again.";
    case "INVALID_TOKEN":
      return "This link is invalid or has expired. Request a new one.";
    case "SOCIAL_ACCOUNT_ALREADY_LINKED":
    case "ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER":
      return "That Google account is already connected to a different SyncSpace account.";
    case "SESSION_NOT_FRESH":
      return "For your security, sign in again before making this change.";
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return "You can't disconnect your only way to sign in. Set a password first.";
  }
  if (error?.status === 429) return "Too many attempts. Wait a minute and try again.";
  return error?.message || "Something went wrong. Please try again.";
}
