# REST API

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

## Workspaces

- `GET /workspaces`
- `POST /workspaces`
- `GET /workspaces/:workspaceId`
- `POST /workspaces/:workspaceId/members`
- `PUT /workspaces/:workspaceId/members/:userId`
- `DELETE /workspaces/:workspaceId/members/:userId`

## Documents

- `GET /workspaces/:workspaceId/documents`
- `POST /workspaces/:workspaceId/documents`
- `GET /documents/:documentId`
- `GET /documents/:documentId/versions`

## Contracts

All request bodies use shared Zod or class-validator-backed DTOs. Client input is never trusted without validation.
