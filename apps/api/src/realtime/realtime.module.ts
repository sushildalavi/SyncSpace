import { Global, Module } from "@nestjs/common";
import { RealtimeBus } from "./realtimeBus.service.js";

@Global()
@Module({ providers: [RealtimeBus], exports: [RealtimeBus] })
export class RealtimeModule {}
