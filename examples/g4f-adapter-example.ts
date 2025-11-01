/**
 * G4F Adapter Example
 * 
 * This file demonstrates how to create and use the G4F adapter in the AI Chat project.
 * 
 * Prerequisites:
 * 1. Install and run G4F API server: python -m g4f.api --port 1337
 * 2. Ensure G4F_API_URL environment variable is set (or use default http://localhost:1337)
 * 
 * For detailed integration guide, see: G4F_INTEGRATION.md
 */

import { randomUUID } from "crypto";
import { Message } from "../src/types/Message";
import { AIResponse, StreamingChunk, StreamingParams } from "../src/types/Responses";
import { AIAdapter } from "../src/ai/adapters/AIAdapter";

/**
 * G4F Adapter Implementation
 * 
 * This adapter connects to a G4F API server running locally or remotely.
 * It supports both regular and streaming message sending.
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
    const requestBody = {
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
    const requestBody = {
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
            const parsed = JSON.parse(data);
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
            // Log parse errors with context for debugging
            console.warn('Failed to parse G4F stream chunk:', {
              error: (e as Error).message,
              rawData: data.substring(0, 100), // Log first 100 chars for context
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

  private convertMessages(messages: Message[]): Array<{ role: string; content: string }> {
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

/**
 * Usage Example 1: Basic message sending
 */
async function example1_BasicUsage() {
  console.log('Example 1: Basic message sending\n');
  
  const adapter = new G4FAdapter('gpt-3.5-turbo', 'ChatGPT');
  
  const messages: Message[] = [
    {
      id: randomUUID(),
      role: 'user',
      content: 'What is TypeScript?',
      createdAt: new Date(),
    },
  ];

  try {
    const response = await adapter.sendMessage(messages);
    console.log('Response:', response.content);
    console.log('Tokens used:', response.usage);
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

/**
 * Usage Example 2: Streaming responses
 */
async function example2_StreamingUsage() {
  console.log('\nExample 2: Streaming responses\n');
  
  const adapter = new G4FAdapter('gpt-4', 'GPT-4');
  
  const messages: Message[] = [
    {
      id: randomUUID(),
      role: 'user',
      content: 'Explain async/await in JavaScript in 3 sentences.',
      createdAt: new Date(),
    },
  ];

  try {
    let fullResponse = '';
    await adapter.streamMessage(
      messages,
      { temperature: 0.7 },
      (chunk) => {
        process.stdout.write(chunk.content);
        fullResponse += chunk.content;
      }
    );
    console.log('\n\nFull response length:', fullResponse.length);
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

/**
 * Usage Example 3: Using with SequentialSessionService
 */
async function example3_IntegrationWithSessionService() {
  console.log('\nExample 3: Integration with Session Service\n');
  
  // In SequentialSessionService.ts, modify the getAdapter method:
  /*
  private getAdapter(modelId: string): AIAdapter {
    if (!this.adapters.has(modelId)) {
      if (modelId.startsWith('mock-')) {
        this.adapters.set(modelId, new MockAdapter(modelId));
      } else {
        // Use G4F adapter for real models
        this.adapters.set(modelId, new G4FAdapter(modelId));
      }
    }
    return this.adapters.get(modelId)!;
  }
  */
  
  console.log('To integrate with the session service:');
  console.log('1. Copy G4FAdapter class to src/ai/adapters/G4FAdapter.ts');
  console.log('2. Modify SequentialSessionService.getAdapter() as shown above');
  console.log('3. Create chat rooms with real model IDs (e.g., "gpt-4", "claude-3-sonnet")');
}

/**
 * Usage Example 4: Multiple models in a chat room
 */
async function example4_MultipleModels() {
  console.log('\nExample 4: Creating a chat room with multiple G4F models\n');
  
  // Example of creating a chat room with multiple G4F models:
  const chatRoomConfig = {
    name: 'Multi-Model Discussion Room',
    userId: 'demo-user',
    defaultMode: 'sequential' as const,
    aiMembers: [
      {
        id: randomUUID(),
        modelId: 'gpt-4',
        displayName: 'GPT-4 Strategist',
        order: 1,
        isEnabled: true,
        config: {
          systemPrompt: 'You are a strategic thinker who provides high-level insights.',
          temperature: 0.7,
          maxTokens: 1000,
          responseStyle: 'professional' as const,
        },
      },
      {
        id: randomUUID(),
        modelId: 'claude-3-sonnet',
        displayName: 'Claude Analyzer',
        order: 2,
        isEnabled: true,
        config: {
          systemPrompt: 'You are a detail-oriented analyst who examines all aspects.',
          temperature: 0.6,
          maxTokens: 800,
          responseStyle: 'detailed' as const,
        },
      },
      {
        id: randomUUID(),
        modelId: 'llama-2-70b',
        displayName: 'Llama Implementer',
        order: 3,
        isEnabled: true,
        config: {
          systemPrompt: 'You focus on practical implementation and action steps.',
          temperature: 0.5,
          maxTokens: 800,
          responseStyle: 'actionable' as const,
        },
      },
    ],
  };
  
  console.log('Chat room configuration:');
  console.log(JSON.stringify(chatRoomConfig, null, 2));
  console.log('\nThis room will use GPT-4, Claude 3 Sonnet, and Llama 2 70B in sequence!');
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('='.repeat(60));
  console.log('G4F Adapter Examples for AI Chat Project');
  console.log('='.repeat(60));
  console.log('\nNote: Make sure G4F API server is running on http://localhost:1337');
  console.log('Start it with: python -m g4f.api --port 1337\n');
  
  // Uncomment the examples you want to run:
  
  // await example1_BasicUsage();
  // await example2_StreamingUsage();
  await example3_IntegrationWithSessionService();
  await example4_MultipleModels();
  
  console.log('\n' + '='.repeat(60));
  console.log('Examples completed!');
  console.log('For more details, see G4F_INTEGRATION.md');
  console.log('='.repeat(60));
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
