import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from "@nestjs/websockets";
import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { CollaborationService } from "./collaboration.service.js";

@WebSocketGateway({ path: "/collaboration" })
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly collaborationService: CollaborationService) {}

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    void this.collaborationService.handleConnection(client, request);
  }

  handleDisconnect(client: WebSocket): void {
    this.collaborationService.handleDisconnect(client);
  }

  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: WebSocket, @MessageBody() message: string): void {
    void this.collaborationService.handleClientMessage(client, message);
  }
}
