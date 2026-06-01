# Lobby server

Express + Socket.io backend for the lobby app.

## Architecture

HTTP and realtime are **two transport layers** that share the same **services** (business logic + Drizzle). Controllers adapt each transport to those services; they do not call each other.

```
                    ┌── http/routes ──► http/controllers ──┐
                    │                                      ├──► services ──► domain / infrastructure
                    └── registerRoomNamespaces ──► realtime/controllers ──┘
                              (RoomController)
```

| Layer | HTTP | Realtime |
|-------|------|----------|
| Wiring | `HttpApp`, route factories | `registerRoomNamespaces` |
| Controllers | `AuthController` (incl. OAuth callbacks), `MeController`, … | `RoomController` (one per room namespace) |
| Services | `AuthService`, `MessageService`, … | same instances |

**Naming:** PascalCase files export a primary class (`AuthService.ts`, `RoomController.ts`). Lowercase files export functions or pure domain helpers (`createServices.ts`, `domain/rooms.ts`).

## Bootstrap

[`src/index.ts`](src/index.ts) is the composition root:

1. `createDatabase` → `createServices`
2. `createHttpControllers(services)` + `createRealtimeControllers(services)`
3. `AuthGuard` shared by both transports
4. `HttpApp` + `RealtimeServer`

## Layout

```
src/
  app/           HttpApp, RealtimeServer
  auth/          JWT, Passport strategy registration, AuthGuard
  config/        Zod env, CORS
  domain/        Pure rules (rooms, avatars, chat NPC config)
  http/
    controllers/ REST controllers
    routes/      Router factories
    middleware/
  realtime/
    controllers/ RoomController (socket)
    createRealtimeControllers, PlayerPresence, registerRoomNamespaces
  services/      Use cases + Drizzle queries
  infrastructure/ DB, Groq, profanity, cookies
```
