import { randomUUID } from "crypto";
import { AIAdapter } from "../ai/adapters/AIAdapter";
import { MockAdapter } from "../ai/adapters/MockAdapter";
import { G4FAdapter } from "../ai/adapters/G4FAdapter";
import { Message } from "../types/Message";
import { AIResponse, StreamingChunk } from "../types/Responses";
import { store } from "../storage/InMemoryStore";
import {
  AIMember,
  ChatRoom,
  SequentialSession,
  SequentialSpeakerState,
  SessionState,
} from "./types";

interface SessionCallbacks {
  onChunk?: (
    chunk: StreamingChunk,
    session: SequentialSession,
    speaker: SequentialSpeakerState,
  ) => void;
  onComplete?: (
    response: AIResponse,
    session: SequentialSession,
    speaker: SequentialSpeakerState,
  ) => void;
  onStateChange?: (session: SequentialSession) => void;
}

export class SequentialSessionService {
  private adapters = new Map<string, AIAdapter>();

  constructor(private readonly callbacks: SessionCallbacks = {}) {}

  startSession(chatRoom: ChatRoom, userId: string, question: string): SequentialSession {
    const session: SequentialSession = {
      id: randomUUID(),
      chatRoomId: chatRoom.id,
      userId,
      question,
      state: "INITIALIZING",
      currentIndex: 0,
      speakers: chatRoom.aiMembers.map((member) => ({
        aiMemberId: member.id,
        modelId: member.modelId,
        displayName: member.displayName,
        order: member.order,
        status: "waiting",
        supplementCount: 0,
      })),
      messages: [
        {
          id: randomUUID(),
          role: "user",
          content: question,
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    store.saveSession(session);
    this.callbacks.onStateChange?.(session);
    void this.advance(session.id);
    return session;
  }

  getSession(sessionId: string): SequentialSession {
    const session = store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  async advance(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session.state === "PAUSED") {
      throw new Error("Session is paused. Resume before continuing");
    }
    if (session.state === "AI_SPEAKING") {
      throw new Error("Current speaker is still responding");
    }
    if (session.state === "COMPLETED" || session.state === "ERROR") return;

    if (session.currentIndex >= session.speakers.length) {
      this.updateSession(session, { state: "COMPLETED" });
      return;
    }

    const speaker = session.speakers[session.currentIndex];
    if (!speaker) {
      this.updateSession(session, { state: "COMPLETED" });
      return;
    }

    this.updateSpeaker(session, speaker.aiMemberId, {
      status: "speaking",
      startTime: new Date(),
    });
    this.updateSession(session, { state: "AI_THINKING" });

    const adapter = this.getAdapter(speaker.modelId);
    const messages = this.buildMessages(session, speaker);

    this.updateSession(session, { state: "AI_SPEAKING" });
    try {
      const memberConfig = speakerConfig(chatRoomOf(session).aiMembers, speaker);
      const response = await adapter.streamMessage(
        messages,
        {
          maxTokens: memberConfig.config.maxTokens ?? 600,
          temperature: memberConfig.config.temperature ?? 0.7,
          responseStyle: memberConfig.config.responseStyle ?? "balanced",
        },
        (chunk) => {
          this.callbacks.onChunk?.(chunk, session, speaker);
        },
      );

      const message: Message = {
        id: randomUUID(),
        role: "assistant",
        speakerId: speaker.aiMemberId,
        content: response.content,
        createdAt: new Date(),
        metadata: {
          model: speaker.modelId,
          usage: response.usage,
        },
      };
      session.messages.push(message);

      this.updateSpeaker(session, speaker.aiMemberId, {
        status: "finished",
        endTime: new Date(),
      });

      session.currentIndex += 1;
      const nextState = session.currentIndex >= session.speakers.length ? "COMPLETED" : "AI_FINISHED";
      this.updateSession(session, { state: nextState });
      this.callbacks.onComplete?.(response, session, speaker);
    } catch (error) {
      this.updateSession(session, { state: "ERROR" });
      throw error;
    }
  }

  async next(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session.state !== "AI_FINISHED") {
      throw new Error("Current session is not ready for the next speaker");
    }
    if (session.currentIndex >= session.speakers.length) {
      this.updateSession(session, { state: "COMPLETED" });
      return;
    }
    await this.advance(sessionId);
  }

  pause(sessionId: string): SequentialSession {
    const session = this.getSession(sessionId);
    if (["COMPLETED", "ERROR"].includes(session.state)) {
      throw new Error("Cannot pause a finished session");
    }
    if (session.state === "PAUSED") {
      return session;
    }
    this.updateSession(session, { state: "PAUSED" });
    return session;
  }

  resume(sessionId: string): SequentialSession {
    const session = this.getSession(sessionId);
    if (session.state !== "PAUSED") {
      throw new Error("Session is not paused");
    }
    const nextState = session.currentIndex >= session.speakers.length ? "COMPLETED" : "AI_FINISHED";
    this.updateSession(session, { state: nextState });
    return session;
  }

  skip(sessionId: string): SequentialSession {
    const session = this.getSession(sessionId);
    if (session.state !== "AI_FINISHED") {
      throw new Error("Can only skip while waiting for user action");
    }
    if (session.currentIndex >= session.speakers.length) {
      this.updateSession(session, { state: "COMPLETED" });
      return session;
    }
    const speaker = session.speakers[session.currentIndex];
    if (!speaker) {
      throw new Error("No speaker available to skip");
    }
    this.updateSpeaker(session, speaker.aiMemberId, {
      status: "skipped",
      endTime: new Date(),
    });
    session.currentIndex += 1;
    const nextState = session.currentIndex >= session.speakers.length ? "COMPLETED" : "AI_FINISHED";
    this.updateSession(session, { state: nextState });
    return session;
  }

  supplement(sessionId: string, aiMemberId: string, followUp: string): Promise<void> {
    const session = this.getSession(sessionId);
    const speaker = session.speakers.find((sp) => sp.aiMemberId === aiMemberId);
    if (!speaker) {
      throw new Error(`Speaker ${aiMemberId} not found`);
    }
    if (session.state === "PAUSED") {
      throw new Error("Cannot supplement while session is paused");
    }

    const parentMessageId = getLast(session.messages.filter((msg) => msg.speakerId === aiMemberId))?.id;
    const followupMessage: Message = {
      id: randomUUID(),
      role: "user",
      content: followUp,
      createdAt: new Date(),
      ...(parentMessageId ? { parentId: parentMessageId } : {}),
    };
    session.messages.push(followupMessage);

    this.updateSession(session, { state: "SUPPLEMENTING" });
    speaker.supplementCount += 1;

    const fallbackState =
      session.currentIndex >= session.speakers.length ? "COMPLETED" : "AI_FINISHED";

    return this.generateSupplement(session, speaker, followupMessage).catch((error) => {
      speaker.supplementCount = Math.max(0, speaker.supplementCount - 1);
      this.updateSession(session, { state: fallbackState });
      throw error;
    });
  }

  private async generateSupplement(
    session: SequentialSession,
    speaker: SequentialSpeakerState,
    followup: Message,
  ): Promise<void> {
    const adapter = this.getAdapter(speaker.modelId);
    const messages = this.buildSupplementMessages(session, speaker, followup);

    const memberConfig = speakerConfig(chatRoomOf(session).aiMembers, speaker);
    const response = await adapter.sendMessage(messages, {
      maxTokens: memberConfig.config.maxTokens ?? 400,
      temperature: memberConfig.config.temperature ?? 0.6,
      responseStyle: memberConfig.config.responseStyle ?? "balanced",
    });

    const supplemental: Message = {
      id: randomUUID(),
      role: "assistant",
      content: response.content,
      createdAt: new Date(),
      speakerId: speaker.aiMemberId,
      parentId: followup.id,
      metadata: {
        supplemental: true,
        usage: response.usage,
      },
    };
    session.messages.push(supplemental);
    const nextState = session.currentIndex >= session.speakers.length ? "COMPLETED" : "AI_FINISHED";
    this.updateSession(session, { state: nextState });
  }

  private buildMessages(session: SequentialSession, speaker: SequentialSpeakerState): Message[] {
    const room = chatRoomOf(session);
    const member = room.aiMembers.find((m) => m.id === speaker.aiMemberId);
    const systemPrompt = member?.config.systemPrompt ?? "你是一个乐于助人的 AI 助手。";

    const history = session.messages.map((msg) => ({ ...msg }));
    history.unshift({
      id: randomUUID(),
      role: "system",
      content: [
        systemPrompt,
        `你在本轮顺序发言中位于第 ${speaker.order} 位，需关注之前讨论。`,
        this.buildHistorySummary(session, speaker.order),
      ].join("\n\n"),
      createdAt: new Date(),
    });
    return history;
  }

  private buildSupplementMessages(
    session: SequentialSession,
    speaker: SequentialSpeakerState,
    followup: Message,
  ): Message[] {
    const previous = session.messages
      .filter((msg) => msg.speakerId === speaker.aiMemberId)
      .map((msg) => `${msg.content}`)
      .join("\n\n");

    return [
      {
        id: randomUUID(),
        role: "system",
        content: [
          "你正在对自己的上一条回复进行补充。",
          "请结合之前的回答与用户追问，提供延伸或澄清。",
          "保持语气一致，并引用必要的上下文。",
        ].join("\n"),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        role: "assistant",
        content: `你之前的回答：\n${previous}`,
        createdAt: new Date(),
      },
      followup,
    ];
  }

  private buildHistorySummary(session: SequentialSession, order: number): string {
    const relevant = session.messages.filter((msg) => msg.role === "assistant");
    if (!relevant.length) return "目前尚无其他 AI 发言。";

    return relevant
      .map((msg, idx) => {
        const speaker = session.speakers.find((sp) => sp.aiMemberId === msg.speakerId);
        return `第 ${speaker?.order ?? idx + 1} 位 ${speaker?.displayName ?? "AI"} 的观点：${msg.content.slice(0, 180)}...`;
      })
      .join("\n");
  }

  private getAdapter(modelId: string): AIAdapter {
    if (!this.adapters.has(modelId)) {
      // Use MockAdapter for models starting with 'mock-'
      // Use G4FAdapter for all other models
      if (modelId.startsWith('mock-')) {
        this.adapters.set(modelId, new MockAdapter(modelId));
      } else {
        this.adapters.set(modelId, new G4FAdapter(modelId));
      }
    }
    return this.adapters.get(modelId)!;
  }

  private updateSession(session: SequentialSession, partial: Partial<SequentialSession>): void {
    Object.assign(session, partial);
    session.updatedAt = new Date();
    store.saveSession(session);
    this.callbacks.onStateChange?.(session);
  }

  private updateSpeaker(
    session: SequentialSession,
    aiMemberId: string,
    partial: Partial<SequentialSpeakerState>,
  ): void {
    const speaker = session.speakers.find((sp) => sp.aiMemberId === aiMemberId);
    if (!speaker) return;
    Object.assign(speaker, partial);
    session.updatedAt = new Date();
    store.saveSession(session);
    this.callbacks.onStateChange?.(session);
  }
}

function chatRoomOf(session: SequentialSession): ChatRoom {
  const room = store.getChatRoom(session.chatRoomId);
  if (!room) {
    throw new Error(`Chat room ${session.chatRoomId} missing for session ${session.id}`);
  }
  return room;
}

function speakerConfig(members: AIMember[], speaker: SequentialSpeakerState): AIMember {
  const member = members.find((m) => m.id === speaker.aiMemberId);
  if (!member) {
    throw new Error(`Member ${speaker.aiMemberId} not found`);
  }
  return member;
}

function getLast<T>(items: T[]): T | undefined {
  return items.length ? items[items.length - 1] : undefined;
}
