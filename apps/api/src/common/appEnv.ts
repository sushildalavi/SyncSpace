import { Global, Module } from "@nestjs/common";
import { parseEnvironment, type Environment } from "@syncspace/config";

export const APP_ENV = Symbol("APP_ENV");
export type AppEnv = Environment;

@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: (): Environment => parseEnvironment(process.env) }],
  exports: [APP_ENV]
})
export class AppEnvModule {}
