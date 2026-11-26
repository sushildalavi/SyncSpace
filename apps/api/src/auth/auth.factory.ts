import { Algorithm, hash, verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/database.module.js";
import * as schema from "../db/schema.js";
import { actionEmail } from "../mail/templates.js";
import type { MailMessage } from "../mail/mailer.service.js";

export type AuthDeps = {
  db: Db;
  env: {
    NODE_ENV: string;
    BETTER_AUTH_SECRET: string;
    API_BASE_URL: string;
    WEB_ORIGIN: string;
    GOOGLE_CLIENT_ID?: string | undefined;
    GOOGLE_CLIENT_SECRET?: string | undefined;
    REQUIRE_EMAIL_VERIFICATION: boolean;
    SESSION_TTL_DAYS: number;
  };
  sendMail: (message: MailMessage) => Promise<void>;
  onSessionRevoked?: (session: { id: string; userId: string }) => void;
  audit?: (event: { type: string; userId: string; metadata?: Record<string, unknown>; ip?: string | null }) => void;
};

/** OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1). */
const ARGON2 = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function createAuth({ db, env, sendMail, onSessionRevoked, audit }: AuthDeps) {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const production = env.NODE_ENV === "production";

  /** Binds document shares addressed to an email once someone has proved they own it. */
  const claimShares = async (account: { id: string; email: string; emailVerified: boolean }) => {
    if (account.emailVerified) {
      await db
        .update(schema.documentShare)
        .set({ userId: account.id })
        .where(and(eq(schema.documentShare.email, account.email.toLowerCase()), isNull(schema.documentShare.userId)));
    }
  };

  /** A correct password with two-factor on creates a session that is discarded at once: that is not a sign-in. */
  const awaitingSecondFactor = async (path: string | undefined, userId: string) => {
    if (path !== "/sign-in/email") {
      return false;
    }
    const [row] = await db.select({ enabled: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    return Boolean(row?.enabled);
  };

  return betterAuth({
    appName: "SyncSpace",
    baseURL: env.API_BASE_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    // OAuth failures (cancelled consent, bad state, unlinked account) land on a page that explains them.
    onAPIError: { errorURL: `${env.WEB_ORIGIN}/auth/error` },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
        twoFactor: schema.twoFactor
      }
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: production,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: production }
    },
    session: {
      expiresIn: 60 * 60 * 24 * env.SESSION_TTL_DAYS,
      updateAge: 60 * 60 * 24,
      // No cookie cache: every request reads the database, so revocation is immediate.
      cookieCache: { enabled: false }
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        audit?.({ type: "auth.password_reset", userId: user.id });
      },
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: async ({ hash: stored, password }) => {
          if (stored.startsWith("$2")) {
            // Accounts migrated from the legacy bcrypt system: verify, then upgrade to Argon2id.
            const ok = await bcrypt.compare(password, stored);
            if (ok) {
              await db.update(schema.account).set({ password: await hash(password, ARGON2) }).where(eq(schema.account.password, stored));
            }
            return ok;
          }
          return verify(stored, password);
        }
      },
      sendResetPassword: async ({ user, url }) => {
        const body = actionEmail({
          heading: "Reset your SyncSpace password",
          body: "Use the button below to choose a new password. The link expires in one hour.",
          actionLabel: "Reset password",
          url
        });
        await sendMail({ to: user.email, subject: "Reset your SyncSpace password", ...body });
      }
    },
    // Applies to password sign-in. Google sign-in relies on the protections of the Google account.
    plugins: [twoFactor({ issuer: "SyncSpace" })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Two-factor: an unconfirmed account can be signed in by its confirmation link, which would skip the code.
        // Email change: only a confirmed address can approve a move, so a stolen session alone can't take an account.
        if (ctx.path === "/two-factor/enable" || ctx.path === "/change-email") {
          const current = await getSessionFromCtx(ctx);
          if (current && !current.user.emailVerified) {
            throw new APIError("FORBIDDEN", { message: "Confirm your current email address first" });
          }
        }
      })
    },
    user: {
      changeEmail: {
        enabled: true,
        // The current address approves first, then the new one is verified. A stolen session alone can't move an account.
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          const body = actionEmail({
            heading: "Approve your new email address",
            body: `Someone asked to change the email on your SyncSpace account to ${newEmail}. If this wasn't you, ignore this message and change your password.`,
            actionLabel: "Approve change",
            url
          });
          await sendMail({ to: user.email, subject: "Approve your SyncSpace email change", ...body });
        }
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url: rawUrl }) => {
        // Links created by an unverified sign-in attempt carry no callback. Always return people to the app.
        const link = new URL(rawUrl);
        const callback = link.searchParams.get("callbackURL");
        if (!callback || callback === "/") {
          link.searchParams.set("callbackURL", `${env.WEB_ORIGIN}/verify-email?status=success`);
        }
        const url = link.toString();
        const body = actionEmail({
          heading: "Confirm your email address",
          body: "Confirm this address to finish setting up your SyncSpace account.",
          actionLabel: "Confirm email",
          url
        });
        await sendMail({ to: user.email, subject: "Confirm your SyncSpace email", ...body });
      }
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            // Authentication only: openid, email and profile. No Gmail, Drive or Calendar scopes.
            prompt: "select_account",
            includeGrantedScopes: false
          }
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // An email match must never merge identities by itself. Google can only be attached
        // from inside an authenticated session (the explicit "Connect Google" action).
        disableImplicitLinking: true,
        trustedProviders: [],
        allowDifferentEmails: true
      }
    },
    databaseHooks: {
      user: {
        create: { after: async (account) => claimShares(account) },
        update: {
          after: async (account, ctx) => {
            await claimShares(account);
            const event = securityEvent(ctx?.path, account, ctx?.query?.token);
            if (event) {
              audit?.({ type: event, userId: account.id });
            }
          }
        }
      },
      account: {
        // We only need the identity, not the ability to call Google on the user's behalf.
        create: {
          before: async (account) => ({ data: stripProviderTokens(account) }),
          after: async (account) => {
            if (account.providerId !== "credential") {
              audit?.({ type: "auth.provider_linked", userId: account.userId, metadata: { provider: account.providerId } });
            }
          }
        },
        update: { before: async (account) => ({ data: stripProviderTokens(account) }) },
        delete: {
          after: async (account) => {
            if (account?.providerId !== "credential") {
              audit?.({ type: "auth.provider_unlinked", userId: account!.userId, metadata: { provider: account!.providerId } });
            }
          }
        }
      },
      session: {
        create: {
          after: async (session, ctx) => {
            const challenged = await awaitingSecondFactor(ctx?.path, session.userId);
            audit?.({
              type: challenged ? "auth.two_factor_challenged" : "auth.signed_in",
              userId: session.userId,
              ip: session.ipAddress ?? null,
              metadata: { userAgent: session.userAgent ?? null }
            });
          }
        },
        delete: {
          after: async (session, ctx) => {
            onSessionRevoked?.({ id: session.id, userId: session.userId });
            if (!(await awaitingSecondFactor(ctx?.path, session.userId))) {
              audit?.({ type: "auth.session_ended", userId: session.userId });
            }
          }
        }
      }
    }
  });
}

/** Which account change, if any, a user update represents, judged by the request that caused it. */
function securityEvent(path: string | undefined, account: { email: string; twoFactorEnabled?: unknown }, token: unknown): string | null {
  if (path === "/two-factor/verify-totp" && account.twoFactorEnabled) {
    return "auth.two_factor_enabled";
  }
  if (path === "/two-factor/disable") {
    return "auth.two_factor_disabled";
  }
  if (path === "/verify-email" && typeof token === "string") {
    // Better Auth has already checked the signature by the time it updates the user.
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString() || "{}") as { updateTo?: string };
    return claims.updateTo === account.email ? "auth.email_changed" : null;
  }
  return null;
}

function stripProviderTokens<T extends Record<string, unknown>>(account: T): T {
  const next: Record<string, unknown> = { ...account };
  for (const key of ["accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt"]) {
    if (key in next) {
      next[key] = null;
    }
  }
  return next as T;
}

export type Auth = ReturnType<typeof createAuth>;
