import { Message } from "../types/Message";

export type SessionState =
  | "IDLE"
  | "INITIALIZING"
  | "AI_THINKING"
  | "AI_SPEAKING"
  | "AI_FINISHED"
  | "SUPPLEMENTING"
  | "PAUSED"
  | "COMPLETED"
  | "ERROR";

export interface AIMember {
  id: string;
  modelId: string;
  displayName: string;
  order: number;
  isEnabled: boolean;
  config: Partial<AIMemberConfig>;
}

export interface AIMemberConfig {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  responseStyle: "balanced" | "formal" | "creative";
}

export interface ChatRoom {
  id: string;
  name: string;
  userId: string;
  aiMembers: AIMember[];
  defaultMode: "normal" | "sequential";
  createdAt: Date;
  updatedAt: Date;
}

export interface SequentialSpeakerState {
  aiMemberId: string;
  modelId: string;
  displayName: string;
  order: number;
  status: "waiting" | "speaking" | "finished" | "skipped";
  startTime?: Date;
  endTime?: Date;
  supplementCount: number;
}

export interface SequentialSession {
  id: string;
  chatRoomId: string;
  userId: string;
  question: string;
  state: SessionState;
  currentIndex: number;
  speakers: SequentialSpeakerState[];
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
