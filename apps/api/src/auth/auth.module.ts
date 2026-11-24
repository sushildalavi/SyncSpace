import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DB, type Db } from "../db/database.module.js";
import { MailerService } from "../mail/mailer.service.js";
import { RealtimeBus } from "../realtime/realtime-bus.service.js";
import { APP_ENV, type AppEnv } from "../shared/app-env.js";
import { AUTH } from "./auth.constants.js";
import { createAuth } from "./auth.factory.js";
import { SessionGuard } from "./session.guard.js";

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [DB, APP_ENV, MailerService, RealtimeBus],
      useFactory: (db: Db, env: AppEnv, mailer: MailerService, bus: RealtimeBus) =>
        createAuth({
          db,
          env,
          sendMail: (message) => mailer.send(message),
          onSessionRevoked: (session) => {
            void bus.publish({ type: "session.revoked", userId: session.userId, sessionId: session.id });
          }
        })
    },
    SessionGuard,
    { provide: APP_GUARD, useExisting: SessionGuard }
  ],
  exports: [AUTH, SessionGuard]
})
export class AuthModule {}
