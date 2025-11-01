import { randomUUID } from "crypto";
import { Message } from "../../types/Message";
import { AIResponse, StreamingChunk, StreamingParams } from "../../types/Responses";
import { AIAdapter } from "./AIAdapter";

const DEFAULT_LATENCY_MS = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockAdapter implements AIAdapter {
  public readonly modelId: string;
  public readonly displayName: string;
  public readonly supportsStreaming = true;

  constructor(modelId: string, displayName?: string) {
    this.modelId = modelId;
    this.displayName = displayName ?? modelId.toUpperCase();
  }

  async sendMessage(messages: Message[], options: Partial<StreamingParams> = {}): Promise<AIResponse> {
    if (!messages.length) {
      throw new Error("MockAdapter requires at least one message");
    }
    const content = this.buildResponse(messages, options);
    return {
      id: randomUUID(),
      model: this.modelId,
      content,
      createdAt: new Date(),
      usage: {
        inputTokens: this.estimateTokens(messages.map((m) => m.content).join("\n")),
        outputTokens: this.estimateTokens(content),
      },
    };
  }

  async streamMessage(
    messages: Message[],
    options: Partial<StreamingParams>,
    onChunk: (chunk: StreamingChunk) => void,
  ): Promise<AIResponse> {
    const response = await this.sendMessage(messages, options);
    const words = response.content.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 1) {
      const piece = words[i];
      if (!piece) continue;
      await delay(DEFAULT_LATENCY_MS);
      onChunk({
        id: randomUUID(),
        model: this.modelId,
        index: i,
        content: piece,
        done: i === words.length - 1,
        createdAt: new Date(),
      });
    }
    return response;
  }

  private buildResponse(messages: Message[], options: Partial<StreamingParams>): string {
    const latest = messages[messages.length - 1];
    if (!latest) {
      throw new Error("Missing latest message");
    }
    const role = latest.role === "user" ? "用户" : "AI";
    const historySummary = messages
      .slice(0, -1)
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .slice(-3)
      .join(" | ");

    const style = options.responseStyle ?? "balanced";
    const lengthHint = options.maxTokens ? Math.min(options.maxTokens / 4, 80) : 60;

    return [
      `${this.displayName}（模型 ${this.modelId}）正在以 ${style} 风格回答。`,
      historySummary ? `最近历史：${historySummary}` : "之前没有讨论历史。",
      `${role}提问：${latest.content}`,
      `回答长度目标：约 ${Math.max(20, Math.round(lengthHint))} 字。`,
      "这是一个模拟回答，用于本地开发和测试。",
    ].join("\n");
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }
}
