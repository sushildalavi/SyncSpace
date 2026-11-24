import { Inject } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { COLLAB_LIMITS } from "@syncspace/contracts";
import { CollaborationService } from "./collaboration.service.js";

@WebSocketGateway({ path: "/collaboration", maxPayload: COLLAB_LIMITS.maxMessageBytes })
export class CollaborationGateway implements OnGatewayConnection {
  constructor(@Inject(CollaborationService) private readonly collaboration: CollaborationService) {}

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    void this.collaboration.handleConnection(client, request).catch(() => client.close(1011, "Server error"));
  }
}
