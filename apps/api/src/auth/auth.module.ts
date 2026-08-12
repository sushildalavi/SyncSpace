import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { AppEnvModule } from "../shared/app-env.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

@Module({
  imports: [AppEnvModule, DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
