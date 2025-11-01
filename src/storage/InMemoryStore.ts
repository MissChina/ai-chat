import { randomUUID } from "crypto";
import { AIMember, ChatRoom, SequentialSession } from "../chat/types";

export class InMemoryStore {
  private chatRooms = new Map<string, ChatRoom>();
  private sessions = new Map<string, SequentialSession>();

  createChatRoom(partial: Omit<ChatRoom, "id" | "createdAt" | "updatedAt">): ChatRoom {
    const now = new Date();
    const room: ChatRoom = {
      ...partial,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      aiMembers: [...partial.aiMembers].sort((a, b) => a.order - b.order),
    };
    this.chatRooms.set(room.id, room);
    return room;
  }

  listChatRooms(userId: string): ChatRoom[] {
    return [...this.chatRooms.values()].filter((room) => room.userId === userId);
  }

  getChatRoom(roomId: string): ChatRoom | undefined {
    return this.chatRooms.get(roomId);
  }

  updateChatRoom(roomId: string, updater: (room: ChatRoom) => ChatRoom): ChatRoom {
    const existing = this.chatRooms.get(roomId);
    if (!existing) {
      throw new Error(`Chat room ${roomId} not found`);
    }
    const updated = updater(existing);
    updated.updatedAt = new Date();
    this.chatRooms.set(roomId, updated);
    return updated;
  }

  saveSession(session: SequentialSession): void {
    this.sessions.set(session.id, session);
  }

  getSession(sessionId: string): SequentialSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(chatRoomId: string): SequentialSession[] {
    return [...this.sessions.values()].filter((session) => session.chatRoomId === chatRoomId);
  }

  reset(): void {
    this.chatRooms.clear();
    this.sessions.clear();
  }

  createDefaultRoom(userId: string): ChatRoom {
    const existingRooms = this.listChatRooms(userId);
    if (existingRooms.length > 0) {
      const [firstRoom] = existingRooms;
      if (!firstRoom) {
        throw new Error("Existing chat room missing");
      }
      return firstRoom;
    }

    const members: AIMember[] = [
      {
        id: randomUUID(),
        modelId: "mock-gpt4",
        displayName: "策略分析官",
        order: 1,
        isEnabled: true,
        config: {
          systemPrompt: "以结构化的方式分析问题并提出策略。",
          temperature: 0.6,
          maxTokens: 800,
          responseStyle: "formal",
        },
      },
      {
        id: randomUUID(),
        modelId: "mock-claude",
        displayName: "风险评估师",
        order: 2,
        isEnabled: true,
        config: {
          systemPrompt: "从风险和依赖角度补充讨论。",
          temperature: 0.5,
          maxTokens: 700,
          responseStyle: "balanced",
        },
      },
      {
        id: randomUUID(),
        modelId: "mock-qwen",
        displayName: "执行顾问",
        order: 3,
        isEnabled: true,
        config: {
          systemPrompt: "强调落地执行和资源匹配。",
          temperature: 0.7,
          maxTokens: 700,
          responseStyle: "balanced",
        },
      },
    ];

    return this.createChatRoom({
      name: "默认聊天室",
      userId,
      aiMembers: members,
      defaultMode: "sequential",
    });
  }
}

export const store = new InMemoryStore();
