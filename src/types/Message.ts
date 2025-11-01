export type Role = "system" | "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: Date;
  speakerId?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}
