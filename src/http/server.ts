import cors from "cors";
import express from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { SessionEventBus } from "../chat/SessionEventBus";
import { SequentialSessionService } from "../chat/SequentialSessionService";
import { store } from "../storage/InMemoryStore";
import { serializeChatRoom, serializeSession } from "./serialize";

const userId = "demo-user";

const createSessionSchema = z.object({
  question: z.string().min(1),
});

const supplementSchema = z.object({
  aiMemberId: z.string().uuid(),
  followUp: z.string().min(1),
});

const createRoomSchema = z.object({
  name: z.string().min(1),
  aiMembers: z
    .array(
      z.object({
        modelId: z.string().min(1),
        displayName: z.string().min(1),
      }),
    )
    .min(1),
});

const eventBus = new SessionEventBus();
const sessionService = new SequentialSessionService({
  onChunk: (chunk, session, speaker) => {
    eventBus.emit({ type: "chunk", sessionId: session.id, speaker, chunk });
  },
  onComplete: (response, session, speaker) => {
    eventBus.emit({ type: "complete", sessionId: session.id, speaker, response });
  },
  onStateChange: (session) => {
    eventBus.emit({ type: "state", session });
  },
});

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/chatrooms", (_req, res) => {
    const rooms = store.listChatRooms(userId);
    if (!rooms.length) {
      rooms.push(store.createDefaultRoom(userId));
    }
    res.json(rooms.map(serializeChatRoom));
  });

  app.post("/api/chatrooms", (req, res) => {
    const result = createRoomSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten() });
    }
    const { name, aiMembers } = result.data;
    const room = store.createChatRoom({
      name,
      userId,
      defaultMode: "sequential",
      aiMembers: aiMembers.map((member, index) => ({
        id: randomUUID(),
        modelId: member.modelId,
        displayName: member.displayName,
        order: index + 1,
        isEnabled: true,
        config: {
          systemPrompt: `${member.displayName} 的角色描述`,
          temperature: 0.6,
          maxTokens: 600,
          responseStyle: "balanced",
        },
      })),
    });
    res.status(201).json(serializeChatRoom(room));
  });

  app.post("/api/chatrooms/:chatRoomId/sessions", (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const room = store.getChatRoom(req.params.chatRoomId);
    if (!room) {
      return res.status(404).json({ error: "Chat room not found" });
    }

    const session = sessionService.startSession(room, userId, parsed.data.question);
    res.status(201).json(serializeSession(session));
  });

  app.get("/api/sessions/:sessionId", (req, res) => {
    try {
      const session = sessionService.getSession(req.params.sessionId);
      res.json(serializeSession(session));
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/api/sessions/:sessionId/supplement", async (req, res) => {
    const parsed = supplementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      await sessionService.supplement(req.params.sessionId, parsed.data.aiMemberId, parsed.data.followUp);
      const session = sessionService.getSession(req.params.sessionId);
      res.json(serializeSession(session));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/sessions/:sessionId/next", async (req, res) => {
    try {
      await sessionService.next(req.params.sessionId);
      const session = sessionService.getSession(req.params.sessionId);
      res.json(serializeSession(session));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/sessions/:sessionId/pause", (req, res) => {
    try {
      const session = sessionService.pause(req.params.sessionId);
      res.json(serializeSession(session));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/sessions/:sessionId/resume", (req, res) => {
    try {
      const session = sessionService.resume(req.params.sessionId);
      res.json(serializeSession(session));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/sessions/:sessionId/skip", (req, res) => {
    try {
      const session = sessionService.skip(req.params.sessionId);
      res.json(serializeSession(session));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/sessions/:sessionId/stream", (req, res) => {
    try {
      const session = sessionService.getSession(req.params.sessionId);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const write = (event: string, payload: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      write("session", serializeSession(session));

      const unsubscribe = eventBus.subscribe(session.id, (event) => {
        switch (event.type) {
          case "state":
            write("state", serializeSession(event.session));
            break;
          case "chunk":
            write("chunk", {
              sessionId: event.sessionId,
              speakerId: event.speaker.aiMemberId,
              chunk: event.chunk,
            });
            break;
          case "complete":
            write("complete", {
              sessionId: event.sessionId,
              speakerId: event.speaker.aiMemberId,
              response: event.response,
            });
            break;
        }
      });

      const heartbeat = setInterval(() => {
        write("heartbeat", {});
      }, 20000);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        res.end();
      });
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  return app;
}
