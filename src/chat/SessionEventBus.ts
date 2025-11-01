import { AIResponse, StreamingChunk } from "../types/Responses";
import { SequentialSession, SequentialSpeakerState } from "./types";

export type SessionEvent =
  | { type: "chunk"; sessionId: string; speaker: SequentialSpeakerState; chunk: StreamingChunk }
  | { type: "complete"; sessionId: string; speaker: SequentialSpeakerState; response: AIResponse }
  | { type: "state"; session: SequentialSession };

export class SessionEventBus {
  private listeners = new Map<string, Set<(event: SessionEvent) => void>>();

  emit(event: SessionEvent): void {
    if (event.type === "state") {
      const targets = this.listeners.get(event.session.id);
      if (!targets) return;
      for (const listener of targets) {
        listener(event);
      }
      return;
    }

    const targets = this.listeners.get(event.sessionId);
    if (!targets) return;
    for (const listener of targets) {
      listener(event);
    }
  }

  subscribe(sessionId: string, listener: (event: SessionEvent) => void): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    const bucket = this.listeners.get(sessionId);
    if (!bucket) {
      throw new Error(`Unable to create listener bucket for ${sessionId}`);
    }
    bucket.add(listener);
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }
}
