# G4F (GPT4Free) 集成指南 / G4F Integration Guide

[English Version](#english-version) | [中文版本](#中文版本)

---

## 中文版本

### 目录
- [什么是 G4F](#什么是-g4f)
- [为什么使用 G4F](#为什么使用-g4f)
- [集成方案](#集成方案)
- [实现步骤](#实现步骤)
- [完整示例代码](#完整示例代码)
- [配置和使用](#配置和使用)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

### 什么是 G4F

G4F (GPT4Free) 是一个开源项目，提供了免费访问多个 AI 模型的能力，包括 GPT-4、GPT-3.5、Claude、Llama 等。它通过逆向工程各种 AI 服务提供商的 API，让开发者无需 API 密钥即可使用这些模型。

**项目地址**: https://github.com/xtekky/gpt4free

**主要特点**：
- 🆓 完全免费，无需 API 密钥
- 🌐 支持多个 AI 提供商（OpenAI, Anthropic, Google 等）
- 🔄 自动切换提供商（当一个不可用时）
- 💬 支持流式响应
- 🎯 简单易用的 Python API

### 为什么使用 G4F

在 AI Chat 项目中集成 G4F 的优势：

1. **降低成本**: 无需支付昂贵的 API 费用
2. **快速原型**: 适合开发和测试阶段
3. **多模型支持**: 一个适配器即可访问多个 AI 模型
4. **灵活性**: 可以轻松切换不同的提供商
5. **社区活跃**: G4F 项目持续更新和维护

**⚠️ 注意事项**：
- G4F 适合开发和测试环境，生产环境建议使用官方 API
- 某些提供商可能不稳定或有使用限制
- 需要遵守各 AI 服务提供商的使用条款

### 集成方案

#### 方案一：直接集成（Python 子进程）

通过 Node.js 调用 Python 脚本来使用 G4F。

**优点**：
- 直接使用 G4F 的 Python 库
- 功能完整，支持所有特性
- 更新方便

**缺点**：
- 需要安装 Python 环境
- 跨语言通信有性能开销
- 部署稍微复杂

#### 方案二：HTTP 代理服务

使用 G4F 的 API 服务器模式。

**优点**：
- 服务解耦，易于扩展
- 可以独立部署和扩容
- 支持多个客户端共享

**缺点**：
- 需要额外的服务管理
- 网络延迟

#### 方案三：使用社区 Node.js 包装

使用社区提供的 Node.js 包装库（如 `g4f`）。

**优点**：
- 纯 JavaScript/TypeScript 实现
- 部署简单
- 性能好

**缺点**：
- 功能可能不如官方 Python 库完整
- 依赖社区维护

**本指南推荐方案二（HTTP 代理服务）**，因为它提供了最好的灵活性和可维护性。

### 实现步骤

#### 步骤 1: 安装和启动 G4F API 服务器

首先，安装 G4F：

```bash
pip install -U g4f
```

启动 G4F API 服务器：

```bash
python -m g4f.api --port 1337 --bind 0.0.0.0
```

或者创建一个启动脚本 `scripts/start-g4f-server.py`：

```python
from g4f.api import run_api

if __name__ == '__main__':
    run_api(
        host='0.0.0.0',
        port=1337,
        debug=False
    )
```

运行：

```bash
python scripts/start-g4f-server.py
```

#### 步骤 2: 创建 G4F 适配器

在 `src/ai/adapters/` 目录下创建 `G4FAdapter.ts`：

```typescript
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
  temperature?: number;
  max_tokens?: number;
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
    this.baseURL = options.baseURL ?? 'http://localhost:1337';
    this.timeout = options.timeout ?? 60000;
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
            // 忽略解析错误，继续处理下一行
            console.warn('Failed to parse G4F stream chunk:', e);
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
    // 粗略估算：英文约 4 字符/token，中文约 2 字符/token
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
```

#### 步骤 3: 在会话服务中注册 G4F 适配器

修改 `src/chat/SequentialSessionService.ts`，更新 `getAdapter` 方法：

```typescript
import { G4FAdapter } from "../ai/adapters/G4FAdapter";

export class SequentialSessionService {
  // ... 其他代码 ...

  private getAdapter(modelId: string): AIAdapter {
    if (!this.adapters.has(modelId)) {
      // 根据 modelId 判断使用哪个适配器
      if (modelId.startsWith('mock-')) {
        this.adapters.set(modelId, new MockAdapter(modelId));
      } else {
        // 使用 G4F 适配器
        this.adapters.set(modelId, new G4FAdapter(modelId));
      }
    }
    return this.adapters.get(modelId)!;
  }

  // ... 其他代码 ...
}
```

#### 步骤 4: 配置环境变量

创建 `.env` 文件：

```bash
# 服务端口
PORT=3000

# G4F API 服务器地址
G4F_API_URL=http://localhost:1337

# G4F 请求超时时间（毫秒）
G4F_TIMEOUT=60000
```

安装 dotenv：

```bash
npm install dotenv
```

在 `src/index.ts` 中加载环境变量：

```typescript
import dotenv from 'dotenv';
dotenv.config();
```

更新 `G4FAdapter` 构造函数使用环境变量：

```typescript
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
  this.timeout = options.timeout ?? Number(process.env.G4F_TIMEOUT ?? 60000);
}
```

### 完整示例代码

#### 创建使用 G4F 的聊天室

```typescript
import { store } from './storage/InMemoryStore';

const g4fRoom = store.createChatRoom({
  name: 'G4F 技术讨论室',
  userId: 'demo-user',
  defaultMode: 'sequential',
  aiMembers: [
    {
      id: randomUUID(),
      modelId: 'gpt-4',
      displayName: 'GPT-4 架构师',
      order: 1,
      isEnabled: true,
      config: {
        systemPrompt: '你是一个经验丰富的软件架构师，擅长系统设计。',
        temperature: 0.7,
        maxTokens: 1000,
        responseStyle: 'professional',
      },
    },
    {
      id: randomUUID(),
      modelId: 'claude-3-sonnet',
      displayName: 'Claude 代码审查员',
      order: 2,
      isEnabled: true,
      config: {
        systemPrompt: '你是一个严谨的代码审查专家，注重代码质量。',
        temperature: 0.5,
        maxTokens: 800,
        responseStyle: 'detailed',
      },
    },
    {
      id: randomUUID(),
      modelId: 'llama-2-70b',
      displayName: 'Llama 性能优化师',
      order: 3,
      isEnabled: true,
      config: {
        systemPrompt: '你专注于性能优化和资源管理。',
        temperature: 0.6,
        maxTokens: 800,
        responseStyle: 'technical',
      },
    },
  ],
});
```

#### 测试 G4F 集成

创建 `scripts/test-g4f.ts`：

```typescript
import { G4FAdapter } from '../src/ai/adapters/G4FAdapter';
import { Message } from '../src/types/Message';

async function testG4F() {
  console.log('🧪 Testing G4F integration...\n');

  const adapter = new G4FAdapter('gpt-3.5-turbo', 'GPT-3.5 Test');

  const messages: Message[] = [
    {
      id: '1',
      role: 'user',
      content: 'Hello! Can you explain what TypeScript is in one sentence?',
      createdAt: new Date(),
    },
  ];

  try {
    console.log('📤 Sending message to G4F...');
    const response = await adapter.sendMessage(messages);
    console.log('✅ Response received:');
    console.log(`   Model: ${response.model}`);
    console.log(`   Content: ${response.content}`);
    console.log(`   Tokens: ${response.usage.outputTokens}\n`);

    console.log('📤 Testing streaming...');
    let streamedContent = '';
    await adapter.streamMessage(
      messages,
      {},
      (chunk) => {
        streamedContent += chunk.content;
        process.stdout.write(chunk.content);
      }
    );
    console.log('\n✅ Streaming completed\n');
    console.log(`   Full content length: ${streamedContent.length} chars`);

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    console.error('   Make sure G4F API server is running on http://localhost:1337');
  }
}

testG4F();
```

编译并运行：

```bash
npm run build
node dist/scripts/test-g4f.js
```

或使用 tsx：

```bash
npx tsx scripts/test-g4f.ts
```

### 配置和使用

#### Docker Compose 配置

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  # G4F API 服务器
  g4f-api:
    image: python:3.11-slim
    working_dir: /app
    command: >
      sh -c "pip install -U g4f &&
             python -m g4f.api --port 1337 --bind 0.0.0.0"
    ports:
      - "1337:1337"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1337/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # AI Chat 服务
  ai-chat:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - G4F_API_URL=http://g4f-api:1337
      - G4F_TIMEOUT=60000
    depends_on:
      - g4f-api
    restart: unless-stopped
```

启动服务：

```bash
docker-compose up -d
```

#### 支持的 G4F 模型

G4F 支持众多模型，常用的包括：

**OpenAI 系列**:
- `gpt-4`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Anthropic 系列**:
- `claude-3-opus`
- `claude-3-sonnet`
- `claude-3-haiku`

**开源模型**:
- `llama-2-70b`
- `llama-2-13b`
- `mistral-7b`
- `mixtral-8x7b`

**Google 系列**:
- `gemini-pro`
- `palm-2`

查看最新支持的模型列表：
```bash
python -c "from g4f import models; print([m.name for m in models.ModelUtils.convert])"
```

### 最佳实践

#### 1. 错误处理和重试

```typescript
class G4FAdapter implements AIAdapter {
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        
        // 如果是 5xx 错误，重试
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`);
          await this.delay(1000 * (i + 1)); // 指数退避
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await this.delay(1000 * (i + 1));
        }
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### 2. 请求限流

```typescript
import pLimit from 'p-limit';

class G4FAdapter implements AIAdapter {
  private static requestLimit = pLimit(5); // 最多 5 个并发请求

  async sendMessage(messages: Message[], options?: Partial<StreamingParams>): Promise<AIResponse> {
    return G4FAdapter.requestLimit(() => this._sendMessage(messages, options));
  }

  private async _sendMessage(
    messages: Message[],
    options?: Partial<StreamingParams>
  ): Promise<AIResponse> {
    // 原来的实现
  }
}
```

#### 3. 缓存响应

```typescript
import NodeCache from 'node-cache';

class G4FAdapter implements AIAdapter {
  private cache = new NodeCache({ stdTTL: 3600 }); // 缓存 1 小时

  async sendMessage(messages: Message[], options?: Partial<StreamingParams>): Promise<AIResponse> {
    const cacheKey = this.getCacheKey(messages, options);
    const cached = this.cache.get<AIResponse>(cacheKey);
    
    if (cached) {
      return { ...cached, id: randomUUID() }; // 返回缓存结果
    }

    const response = await this._sendMessage(messages, options);
    this.cache.set(cacheKey, response);
    return response;
  }

  private getCacheKey(messages: Message[], options?: Partial<StreamingParams>): string {
    return JSON.stringify({ modelId: this.modelId, messages, options });
  }
}
```

#### 4. 监控和日志

```typescript
class G4FAdapter implements AIAdapter {
  private logger = createLogger('G4FAdapter');

  async sendMessage(messages: Message[], options?: Partial<StreamingParams>): Promise<AIResponse> {
    const startTime = Date.now();
    
    this.logger.info('Sending message to G4F', {
      modelId: this.modelId,
      messageCount: messages.length,
    });

    try {
      const response = await this._sendMessage(messages, options);
      const duration = Date.now() - startTime;
      
      this.logger.info('G4F response received', {
        modelId: this.modelId,
        duration,
        outputTokens: response.usage.outputTokens,
      });

      return response;
    } catch (error) {
      this.logger.error('G4F request failed', {
        modelId: this.modelId,
        duration: Date.now() - startTime,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}
```

### 常见问题

#### Q1: G4F API 服务器无法启动

**A**: 检查以下几点：
1. 确保已安装 G4F: `pip install -U g4f`
2. 端口 1337 是否被占用: `lsof -i :1337`
3. 查看 G4F 日志获取详细错误信息

#### Q2: 请求超时或失败

**A**: 
1. 增加超时时间：设置 `G4F_TIMEOUT` 环境变量
2. G4F 可能会自动切换提供商，某些提供商可能暂时不可用
3. 检查网络连接和防火墙设置

#### Q3: 某些模型不可用

**A**: 
1. G4F 的提供商状态会动态变化
2. 尝试切换到其他模型
3. 查看 G4F 项目的最新状态: https://github.com/xtekky/gpt4free

#### Q4: 响应质量不稳定

**A**: 
1. 不同提供商的质量可能有差异
2. 考虑添加响应验证和重试逻辑
3. 生产环境建议使用官方 API

#### Q5: 如何在生产环境使用

**A**: 
G4F 更适合开发和测试。对于生产环境：
1. 使用官方 API 服务
2. 实现官方 API 适配器（OpenAI, Anthropic 等）
3. 保留 G4F 作为降级备用方案

#### Q6: 如何处理并发请求

**A**: 
1. 使用请求队列限制并发数
2. 实现请求限流和退避策略
3. 考虑部署多个 G4F 实例做负载均衡

---

## English Version

### Table of Contents
- [What is G4F](#what-is-g4f)
- [Why Use G4F](#why-use-g4f)
- [Integration Approaches](#integration-approaches)
- [Implementation Steps](#implementation-steps)
- [Complete Example Code](#complete-example-code)
- [Configuration and Usage](#configuration-and-usage)
- [Best Practices](#best-practices-1)
- [FAQ](#faq)

### What is G4F

G4F (GPT4Free) is an open-source project that provides free access to multiple AI models including GPT-4, GPT-3.5, Claude, Llama, and more. It reverse-engineers various AI service providers' APIs, allowing developers to use these models without API keys.

**Project URL**: https://github.com/xtekky/gpt4free

**Key Features**:
- 🆓 Completely free, no API keys required
- 🌐 Supports multiple AI providers (OpenAI, Anthropic, Google, etc.)
- 🔄 Automatic provider switching (when one is unavailable)
- 💬 Supports streaming responses
- 🎯 Simple and easy-to-use Python API

### Why Use G4F

Advantages of integrating G4F in the AI Chat project:

1. **Cost Reduction**: No expensive API fees
2. **Rapid Prototyping**: Ideal for development and testing phases
3. **Multi-model Support**: Access multiple AI models with one adapter
4. **Flexibility**: Easy to switch between different providers
5. **Active Community**: G4F project is continuously updated and maintained

**⚠️ Considerations**:
- G4F is suitable for development and testing environments; official APIs are recommended for production
- Some providers may be unstable or have usage limitations
- Must comply with the terms of service of each AI service provider

### Integration Approaches

#### Approach 1: Direct Integration (Python Subprocess)

Call Python scripts from Node.js to use G4F.

**Pros**:
- Directly uses G4F's Python library
- Full functionality, supports all features
- Easy to update

**Cons**:
- Requires Python environment
- Cross-language communication has performance overhead
- Slightly more complex deployment

#### Approach 2: HTTP Proxy Service

Use G4F's API server mode.

**Pros**:
- Service decoupling, easy to scale
- Can be deployed and scaled independently
- Supports multiple clients sharing

**Cons**:
- Requires additional service management
- Network latency

#### Approach 3: Use Community Node.js Wrapper

Use community-provided Node.js wrapper libraries (like `g4f`).

**Pros**:
- Pure JavaScript/TypeScript implementation
- Simple deployment
- Good performance

**Cons**:
- May not be as feature-complete as the official Python library
- Depends on community maintenance

**This guide recommends Approach 2 (HTTP Proxy Service)** as it provides the best flexibility and maintainability.

### Implementation Steps

See the Chinese version above for detailed implementation steps, including:
1. Installing and starting the G4F API server
2. Creating the G4F adapter
3. Registering the G4F adapter in the session service
4. Configuring environment variables

### Complete Example Code

See the Chinese version above for complete example code including:
- Creating a chat room using G4F
- Testing G4F integration

### Configuration and Usage

#### Docker Compose Configuration

See the Chinese version for the complete `docker-compose.yml` configuration.

#### Supported G4F Models

G4F supports many models, commonly used ones include:

**OpenAI Series**:
- `gpt-4`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Anthropic Series**:
- `claude-3-opus`
- `claude-3-sonnet`
- `claude-3-haiku`

**Open Source Models**:
- `llama-2-70b`
- `llama-2-13b`
- `mistral-7b`
- `mixtral-8x7b`

**Google Series**:
- `gemini-pro`
- `palm-2`

### Best Practices

See the Chinese version for detailed best practices including:
1. Error handling and retry logic
2. Request throttling
3. Response caching
4. Monitoring and logging

### FAQ

**Q1: G4F API server won't start**

A: Check the following:
1. Ensure G4F is installed: `pip install -U g4f`
2. Check if port 1337 is in use: `lsof -i :1337`
3. Review G4F logs for detailed error messages

**Q2: Requests timeout or fail**

A:
1. Increase timeout: set `G4F_TIMEOUT` environment variable
2. G4F may automatically switch providers; some may be temporarily unavailable
3. Check network connection and firewall settings

**Q3: Some models are unavailable**

A:
1. G4F provider status changes dynamically
2. Try switching to other models
3. Check the latest G4F project status: https://github.com/xtekky/gpt4free

**Q4: Inconsistent response quality**

A:
1. Quality may vary between providers
2. Consider adding response validation and retry logic
3. Official APIs are recommended for production

**Q5: How to use in production**

A:
G4F is better suited for development and testing. For production:
1. Use official API services
2. Implement official API adapters (OpenAI, Anthropic, etc.)
3. Keep G4F as a fallback option

**Q6: How to handle concurrent requests**

A:
1. Use request queues to limit concurrency
2. Implement rate limiting and backoff strategies
3. Consider deploying multiple G4F instances for load balancing

---

## 相关资源 / Related Resources

- [G4F GitHub Repository](https://github.com/xtekky/gpt4free)
- [G4F Documentation](https://github.com/xtekky/gpt4free/blob/main/README.md)
- [Development Documentation](./DEVELOPMENT.md)
- [Main README](./README.md)

## 贡献 / Contributing

如果你发现任何问题或有改进建议，欢迎提交 Issue 或 Pull Request！

If you find any issues or have suggestions for improvement, feel free to submit an Issue or Pull Request!

## 许可证 / License

MIT
