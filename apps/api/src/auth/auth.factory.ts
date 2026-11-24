import { Algorithm, hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
};

/** OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1). */
const ARGON2 = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function createAuth({ db, env, sendMail, onSessionRevoked }: AuthDeps) {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const production = env.NODE_ENV === "production";

  return betterAuth({
    appName: "SyncSpace",
    baseURL: env.API_BASE_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit
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
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: stored, password }) => verify(stored, password)
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
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
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
      account: {
        // We only need the identity, not the ability to call Google on the user's behalf.
        create: { before: async (account) => ({ data: stripProviderTokens(account) }) },
        update: { before: async (account) => ({ data: stripProviderTokens(account) }) }
      },
      session: {
        delete: {
          after: async (session) => {
            onSessionRevoked?.({ id: session.id, userId: session.userId });
          }
        }
      }
    }
  });
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
