import { randomUUID } from "crypto";
import { Message } from "../../types/Message";
import { AIResponse, StreamingChunk, StreamingParams } from "../../types/Responses";
import { AIAdapter } from "./AIAdapter";

interface G4FMessage {
  role: string;
  content: string;
}

interface G4FRequest {
  model: string;
  messages: G4FMessage[];
  stream?: boolean;
  temperature?: number | undefined;
  max_tokens?: number | undefined;
}

interface G4FStreamChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string;
    };
    finish_reason?: string;
  }>;
}

/**
 * G4F Adapter Implementation
 * 
 * This adapter connects to a G4F API server to provide free access to multiple AI models
 * including GPT-4, GPT-3.5, Claude, Llama, and more.
 * 
 * Prerequisites:
 * 1. Install G4F: pip install -U g4f
 * 2. Start G4F API server: python -m g4f.api --port 1337
 * 
 * For detailed integration guide, see: G4F_INTEGRATION.md
 */
export class G4FAdapter implements AIAdapter {
  public readonly modelId: string;
  public readonly displayName: string;
  public readonly supportsStreaming = true;

  private readonly baseURL: string;
  private readonly timeout: number;

  constructor(
    modelId: string = 'gpt-3.5-turbo',
    displayName?: string,
    options: {
      baseURL?: string;
      timeout?: number;
    } = {}
  ) {
    this.modelId = modelId;
    this.displayName = displayName ?? this.getDefaultDisplayName(modelId);
    this.baseURL = options.baseURL ?? process.env.G4F_API_URL ?? 'http://localhost:1337';
    this.timeout = options.timeout ?? (process.env.G4F_TIMEOUT ? parseInt(process.env.G4F_TIMEOUT, 10) : 60000);
  }

  async sendMessage(
    messages: Message[],
    options: Partial<StreamingParams> = {}
  ): Promise<AIResponse> {
    const g4fMessages = this.convertMessages(messages);
    const requestBody: G4FRequest = {
      model: this.modelId,
      messages: g4fMessages,
      stream: false,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`G4F API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';

      return {
        id: data.id ?? randomUUID(),
        model: this.modelId,
        content,
        createdAt: new Date(),
        usage: {
          inputTokens: this.estimateTokens(g4fMessages.map(m => m.content).join('\n')),
          outputTokens: this.estimateTokens(content),
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error('G4F request timeout');
      }
      throw error;
    }
  }

  async streamMessage(
    messages: Message[],
    options: Partial<StreamingParams>,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<AIResponse> {
    const g4fMessages = this.convertMessages(messages);
    const requestBody: G4FRequest = {
      model: this.modelId,
      messages: g4fMessages,
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`G4F API error: ${response.status} ${response.statusText}`);
      }

      let fullContent = '';
      let chunkIndex = 0;

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

        for (const line of lines) {
          const data = line.replace('data: ', '').trim();
          
          if (data === '[DONE]') {
            break;
          }

          try {
            const parsed: G4FStreamChunk = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              fullContent += content;
              onChunk({
                id: parsed.id ?? randomUUID(),
                model: this.modelId,
                index: chunkIndex++,
                content,
                done: false,
                createdAt: new Date(),
              });
            }

            if (parsed.choices?.[0]?.finish_reason) {
              onChunk({
                id: parsed.id ?? randomUUID(),
                model: this.modelId,
                index: chunkIndex++,
                content: '',
                done: true,
                createdAt: new Date(),
              });
            }
          } catch (e) {
            // Log parse errors with context for debugging, then continue
            console.warn('Failed to parse G4F stream chunk:', {
              error: (e as Error).message,
              rawData: data.substring(0, 100),
            });
          }
        }
      }

      return {
        id: randomUUID(),
        model: this.modelId,
        content: fullContent,
        createdAt: new Date(),
        usage: {
          inputTokens: this.estimateTokens(g4fMessages.map(m => m.content).join('\n')),
          outputTokens: this.estimateTokens(fullContent),
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error('G4F stream timeout');
      }
      throw error;
    }
  }

  private convertMessages(messages: Message[]): G4FMessage[] {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
      content: msg.content,
    }));
  }

  private estimateTokens(content: string): number {
    // Rough estimation: ~4 chars/token for English, ~2 chars/token for Chinese
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = content.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  private getDefaultDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      'gpt-4': 'GPT-4',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'claude-3-opus': 'Claude 3 Opus',
      'claude-3-sonnet': 'Claude 3 Sonnet',
      'llama-2-70b': 'Llama 2 70B',
      'gemini-pro': 'Gemini Pro',
    };
    return displayNames[modelId] ?? modelId.toUpperCase();
  }
}
