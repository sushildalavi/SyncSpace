import { Global, Module } from "@nestjs/common";
import { parseEnvironment } from "@syncspace/config";

export const APP_ENV = Symbol("APP_ENV");

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useValue: parseEnvironment(process.env)
    }
  ],
  exports: [APP_ENV]
})
export class AppEnvModule {}
