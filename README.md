# AI Chat Sequential Discussion MVP

This repository contains a minimal backend implementation of the sequential AI discussion platform described in the MVP specification. It focuses on the server-side orchestration of sequential speaker turns, mock AI adapters, and HTTP endpoints that expose the primary workflows for experimentation.

## Features

- In-memory chat room management with configurable AI members and default demo data.
- Sequential session engine that streams mock AI responses in turn order.
- Manual advancement controls for "next", "pause", "resume", and "skip" actions that mirror the MVP specification.
- Supplementary follow-up support to extend an individual AI member's response.
- Express-based REST + SSE API for creating chat rooms, orchestrating sessions, and streaming runtime state.
- Vitest test coverage for the sequential engine and supplement workflow.

## Getting Started

```bash
npm install
npm run dev
```

The development server runs on [http://localhost:3000](http://localhost:3000). It exposes the following endpoints:

- `GET /api/chatrooms` – list chat rooms (creates a default room on first access).
- `POST /api/chatrooms` – create a new room with custom AI members.
- `POST /api/chatrooms/:chatRoomId/sessions` – start a new sequential session.
- `GET /api/sessions/:sessionId` – fetch the latest session state including messages.
- `POST /api/sessions/:sessionId/next` – advance to the next AI speaker when ready.
- `POST /api/sessions/:sessionId/pause` – pause the sequential session without advancing.
- `POST /api/sessions/:sessionId/resume` – resume a paused session (returns to `AI_FINISHED`).
- `POST /api/sessions/:sessionId/skip` – skip the upcoming AI speaker.
- `POST /api/sessions/:sessionId/supplement` – request a supplemental answer from an AI member.
- `GET /api/sessions/:sessionId/stream` – subscribe to Server-Sent Events for state, chunk, and completion updates.

Clients should subscribe to the SSE stream to mirror UI state transitions without deploying external infrastructure.

All AI replies are generated through the `MockAdapter`, which simulates latency and token accounting without external API calls.

## Testing

```bash
npm test
```

Vitest exercises the sequential progression and supplement flows to ensure the orchestration logic behaves as expected.

## Production Build

```bash
npm run build
npm start
```

This compiles the TypeScript source to JavaScript in `dist/` and runs the Express server.
