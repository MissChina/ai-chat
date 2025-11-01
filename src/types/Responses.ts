export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
}

export interface AIResponse {
  id: string;
  model: string;
  content: string;
  createdAt: Date;
  usage: UsageStats;
  finishReason?: "stop" | "length" | "error";
}

export interface StreamingChunk {
  id: string;
  model: string;
  index: number;
  content: string;
  createdAt: Date;
  done: boolean;
}

export interface StreamingParams {
  maxTokens: number;
  temperature: number;
  responseStyle: "balanced" | "formal" | "creative";
}
