# AI Chat 开发文档 / Development Documentation

[English Version](#english-version) | [中文版本](#中文版本)

---

## 中文版本

### 目录
- [项目概述](#项目概述)
- [架构设计](#架构设计)
- [快速开始](#快速开始)
- [核心模块详解](#核心模块详解)
- [API 接口文档](#api-接口文档)
- [开发工作流](#开发工作流)
- [测试指南](#测试指南)
- [部署指南](#部署指南)

### 项目概述

AI Chat 是一个支持多 AI 模型顺序对话的后端服务平台。本项目的核心特性包括：

- **顺序发言机制**：多个 AI 模型按顺序依次回答问题
- **可扩展的 AI 适配器架构**：支持对接不同的 AI 服务提供商
- **实时流式响应**：通过 Server-Sent Events (SSE) 实时推送 AI 回复
- **补充问答功能**：允许针对特定 AI 成员进行深入提问
- **会话状态管理**：完整的会话生命周期管理（暂停、恢复、跳过等）

### 架构设计

#### 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     Client / 客户端                      │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/SSE
┌─────────────────┴───────────────────────────────────────┐
│              Express Server / HTTP 层                    │
│  - REST API 端点                                         │
│  - SSE 实时推送                                          │
│  - 请求验证 (Zod)                                        │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│       Sequential Session Service / 会话服务              │
│  - 顺序发言编排                                          │
│  - 状态机管理                                            │
│  - 补充问答处理                                          │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│          AI Adapter Layer / AI 适配器层                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ MockAdapter│  │ G4F Adapter│  │自定义 Adapter│       │
│  └────────────┘  └────────────┘  └────────────┘        │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│     In-Memory Storage / 内存存储                         │
│  - ChatRoom 聊天室数据                                   │
│  - Session 会话数据                                      │
│  - Message 消息数据                                      │
└─────────────────────────────────────────────────────────┘
```

#### 目录结构

```
src/
├── ai/                     # AI 适配器模块
│   └── adapters/
│       ├── AIAdapter.ts    # 适配器接口定义
│       └── MockAdapter.ts  # 模拟适配器实现
├── chat/                   # 对话管理模块
│   ├── SequentialSessionService.ts  # 顺序会话服务
│   ├── SessionEventBus.ts           # 事件总线
│   └── types.ts                     # 类型定义
├── http/                   # HTTP 服务模块
│   ├── server.ts           # Express 服务器
│   └── serialize.ts        # 序列化工具
├── storage/                # 存储模块
│   └── InMemoryStore.ts    # 内存存储实现
├── types/                  # 通用类型定义
│   ├── Message.ts          # 消息类型
│   └── Responses.ts        # 响应类型
└── index.ts                # 应用入口
```

### 快速开始

#### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

#### 安装依赖

```bash
npm install
```

#### 开发模式

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动。

#### 生产构建

```bash
npm run build
npm start
```

#### 运行测试

```bash
npm test
```

### 核心模块详解

#### 1. AI 适配器 (AIAdapter)

AI 适配器是连接不同 AI 服务提供商的桥梁。所有适配器必须实现 `AIAdapter` 接口：

```typescript
export interface AIAdapter {
  readonly modelId: string;        // 模型标识符
  readonly displayName: string;    // 显示名称
  readonly supportsStreaming: boolean;  // 是否支持流式响应

  // 发送消息并获取完整响应
  sendMessage(
    messages: Message[], 
    options?: Partial<StreamingParams>
  ): Promise<AIResponse>;

  // 流式发送消息
  streamMessage(
    messages: Message[],
    options: Partial<StreamingParams>,
    onChunk: (chunk: StreamingChunk) => void,
  ): Promise<AIResponse>;
}
```

**创建自定义适配器示例**：

```typescript
import { AIAdapter } from './AIAdapter';

export class CustomAdapter implements AIAdapter {
  public readonly modelId = 'custom-model';
  public readonly displayName = '自定义模型';
  public readonly supportsStreaming = true;

  async sendMessage(messages, options) {
    // 实现你的 API 调用逻辑
    const response = await fetch('your-api-endpoint', {
      method: 'POST',
      body: JSON.stringify({ messages, ...options })
    });
    return await response.json();
  }

  async streamMessage(messages, options, onChunk) {
    // 实现流式响应逻辑
    const stream = await fetch('your-streaming-endpoint', {
      method: 'POST',
      body: JSON.stringify({ messages, ...options })
    });
    
    const reader = stream.body.getReader();
    // 处理流式数据并调用 onChunk
    // ...
  }
}
```

#### 2. 顺序会话服务 (SequentialSessionService)

顺序会话服务是核心业务逻辑的实现，负责编排多个 AI 模型的顺序发言。

**会话状态机**：

```
INITIALIZING → AI_THINKING → AI_SPEAKING → AI_FINISHED
     ↓                                            ↓
  ERROR                                      COMPLETED
                                                  ↑
     PAUSED ←──────────────────────────────→ (可暂停/恢复)
```

**关键方法**：

- `startSession(chatRoom, userId, question)`: 启动新会话
- `next(sessionId)`: 前进到下一个 AI 发言者
- `pause(sessionId)`: 暂停会话
- `resume(sessionId)`: 恢复会话
- `skip(sessionId)`: 跳过当前发言者
- `supplement(sessionId, aiMemberId, followUp)`: 补充提问

#### 3. 存储层 (InMemoryStore)

当前实现使用内存存储，生产环境建议替换为持久化存储（如 Redis、PostgreSQL）。

**数据模型**：

- **ChatRoom**: 聊天室，包含多个 AI 成员
- **SequentialSession**: 会话实例，跟踪发言进度
- **Message**: 消息记录，支持父子关系（用于补充问答）

### API 接口文档

#### 1. 获取聊天室列表

```http
GET /api/chatrooms
```

**响应示例**：
```json
[
  {
    "id": "uuid",
    "name": "默认聊天室",
    "userId": "demo-user",
    "aiMembers": [
      {
        "id": "uuid",
        "modelId": "mock-gpt4",
        "displayName": "策略分析官",
        "order": 1
      }
    ]
  }
]
```

#### 2. 创建聊天室

```http
POST /api/chatrooms
Content-Type: application/json

{
  "name": "技术讨论室",
  "aiMembers": [
    {
      "modelId": "gpt-4",
      "displayName": "技术顾问"
    }
  ]
}
```

#### 3. 启动会话

```http
POST /api/chatrooms/:chatRoomId/sessions
Content-Type: application/json

{
  "question": "如何设计一个高可用的分布式系统？"
}
```

**响应示例**：
```json
{
  "id": "session-uuid",
  "chatRoomId": "room-uuid",
  "state": "AI_THINKING",
  "currentIndex": 0,
  "speakers": [
    {
      "aiMemberId": "uuid",
      "displayName": "策略分析官",
      "status": "speaking"
    }
  ],
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "如何设计一个高可用的分布式系统？"
    }
  ]
}
```

#### 4. 获取会话状态

```http
GET /api/sessions/:sessionId
```

#### 5. 前进到下一个发言者

```http
POST /api/sessions/:sessionId/next
```

#### 6. 暂停会话

```http
POST /api/sessions/:sessionId/pause
```

#### 7. 恢复会话

```http
POST /api/sessions/:sessionId/resume
```

#### 8. 跳过当前发言者

```http
POST /api/sessions/:sessionId/skip
```

#### 9. 补充提问

```http
POST /api/sessions/:sessionId/supplement
Content-Type: application/json

{
  "aiMemberId": "uuid",
  "followUp": "能否详细说明一下服务发现机制？"
}
```

#### 10. 订阅实时事件流 (SSE)

```http
GET /api/sessions/:sessionId/stream
```

**事件类型**：

- `session`: 初始会话数据
- `state`: 会话状态变更
- `chunk`: AI 回复片段（流式输出）
- `complete`: AI 回复完成
- `heartbeat`: 心跳保活

**示例**：

```javascript
const eventSource = new EventSource('/api/sessions/xxx/stream');

eventSource.addEventListener('chunk', (event) => {
  const data = JSON.parse(event.data);
  console.log('收到片段:', data.chunk.content);
});

eventSource.addEventListener('complete', (event) => {
  const data = JSON.parse(event.data);
  console.log('回复完成:', data.response);
});
```

### 开发工作流

#### 1. 添加新的 AI 适配器

1. 在 `src/ai/adapters/` 创建新文件，例如 `G4FAdapter.ts`
2. 实现 `AIAdapter` 接口
3. 在 `SequentialSessionService.ts` 中注册适配器
4. 编写单元测试

示例：参见 [G4F_INTEGRATION.md](./G4F_INTEGRATION.md)

#### 2. 修改会话逻辑

核心逻辑位于 `SequentialSessionService.ts`，修改时需注意：

- 维护状态机的正确转换
- 确保所有异步操作正确处理错误
- 更新相关的单元测试

#### 3. 扩展 API 端点

在 `src/http/server.ts` 中添加新的路由：

```typescript
app.post('/api/custom-endpoint', async (req, res) => {
  // 参数验证
  const schema = z.object({
    param: z.string()
  });
  const result = schema.safeParse(req.body);
  
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }
  
  // 业务逻辑
  // ...
  
  res.json({ success: true });
});
```

#### 4. 替换存储层

要使用持久化存储，需要：

1. 创建新的存储实现，实现与 `InMemoryStore` 相同的接口
2. 更新 `src/storage/` 导出
3. 配置数据库连接
4. 迁移测试用例

### 测试指南

#### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm test -- --watch

# 生成覆盖率报告
npm test -- --coverage
```

#### 编写测试

测试文件位于 `tests/` 目录，使用 Vitest 框架。

**示例测试**：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SequentialSessionService } from '../src/chat/SequentialSessionService';

describe('SequentialSessionService', () => {
  let service: SequentialSessionService;

  beforeEach(() => {
    service = new SequentialSessionService();
  });

  it('should advance to next speaker', async () => {
    const session = service.startSession(room, userId, question);
    await waitForState(session, 'AI_FINISHED');
    
    await service.next(session.id);
    const updated = service.getSession(session.id);
    
    expect(updated.currentIndex).toBe(1);
  });
});
```

### 部署指南

#### 使用 Docker

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

构建和运行：

```bash
docker build -t ai-chat .
docker run -p 3000:3000 ai-chat
```

#### 环境变量

```bash
PORT=3000              # 服务端口
NODE_ENV=production    # 运行环境
```

#### 生产环境建议

1. **使用进程管理器**：PM2 或 systemd
2. **配置反向代理**：Nginx 或 Caddy
3. **启用 HTTPS**：使用 Let's Encrypt
4. **配置日志收集**：Winston + ELK Stack
5. **监控和告警**：Prometheus + Grafana
6. **持久化存储**：替换 InMemoryStore 为数据库

#### PM2 配置示例

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ai-chat',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

---

## English Version

### Table of Contents
- [Project Overview](#project-overview)
- [Architecture Design](#architecture-design)
- [Quick Start](#quick-start)
- [Core Modules](#core-modules)
- [API Documentation](#api-documentation)
- [Development Workflow](#development-workflow)
- [Testing Guide](#testing-guide)
- [Deployment Guide](#deployment-guide)

### Project Overview

AI Chat is a backend service platform that supports sequential conversations with multiple AI models. Core features include:

- **Sequential Speaking Mechanism**: Multiple AI models answer questions in sequence
- **Extensible AI Adapter Architecture**: Supports integration with different AI service providers
- **Real-time Streaming Responses**: Push AI responses in real-time via Server-Sent Events (SSE)
- **Supplemental Q&A**: Allows follow-up questions to specific AI members
- **Session State Management**: Complete session lifecycle management (pause, resume, skip, etc.)

### Architecture Design

#### Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                            │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/SSE
┌─────────────────┴───────────────────────────────────────┐
│                  Express Server / HTTP Layer             │
│  - REST API Endpoints                                    │
│  - SSE Real-time Push                                    │
│  - Request Validation (Zod)                              │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│          Sequential Session Service                      │
│  - Sequential Speaking Orchestration                     │
│  - State Machine Management                              │
│  - Supplemental Q&A Processing                           │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│               AI Adapter Layer                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │MockAdapter │  │ G4F Adapter│  │Custom      │        │
│  └────────────┘  └────────────┘  └────────────┘        │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│              In-Memory Storage                           │
│  - ChatRoom Data                                         │
│  - Session Data                                          │
│  - Message Data                                          │
└─────────────────────────────────────────────────────────┘
```

#### Directory Structure

```
src/
├── ai/                     # AI Adapter Module
│   └── adapters/
│       ├── AIAdapter.ts    # Adapter Interface
│       └── MockAdapter.ts  # Mock Adapter Implementation
├── chat/                   # Chat Management Module
│   ├── SequentialSessionService.ts  # Sequential Session Service
│   ├── SessionEventBus.ts           # Event Bus
│   └── types.ts                     # Type Definitions
├── http/                   # HTTP Service Module
│   ├── server.ts           # Express Server
│   └── serialize.ts        # Serialization Utils
├── storage/                # Storage Module
│   └── InMemoryStore.ts    # In-Memory Storage Implementation
├── types/                  # Common Type Definitions
│   ├── Message.ts          # Message Types
│   └── Responses.ts        # Response Types
└── index.ts                # Application Entry Point
```

### Quick Start

#### Requirements

- Node.js >= 18.0.0
- npm >= 9.0.0

#### Install Dependencies

```bash
npm install
```

#### Development Mode

```bash
npm run dev
```

Server will start at `http://localhost:3000`.

#### Production Build

```bash
npm run build
npm start
```

#### Run Tests

```bash
npm test
```

### Core Modules

#### 1. AI Adapter

AI adapters are bridges to different AI service providers. All adapters must implement the `AIAdapter` interface:

```typescript
export interface AIAdapter {
  readonly modelId: string;
  readonly displayName: string;
  readonly supportsStreaming: boolean;

  sendMessage(
    messages: Message[], 
    options?: Partial<StreamingParams>
  ): Promise<AIResponse>;

  streamMessage(
    messages: Message[],
    options: Partial<StreamingParams>,
    onChunk: (chunk: StreamingChunk) => void,
  ): Promise<AIResponse>;
}
```

**Custom Adapter Example**:

```typescript
import { AIAdapter } from './AIAdapter';

export class CustomAdapter implements AIAdapter {
  public readonly modelId = 'custom-model';
  public readonly displayName = 'Custom Model';
  public readonly supportsStreaming = true;

  async sendMessage(messages, options) {
    const response = await fetch('your-api-endpoint', {
      method: 'POST',
      body: JSON.stringify({ messages, ...options })
    });
    return await response.json();
  }

  async streamMessage(messages, options, onChunk) {
    // Implement streaming logic
  }
}
```

#### 2. Sequential Session Service

The Sequential Session Service is the core business logic implementation, responsible for orchestrating sequential speaking of multiple AI models.

**Session State Machine**:

```
INITIALIZING → AI_THINKING → AI_SPEAKING → AI_FINISHED
     ↓                                            ↓
  ERROR                                      COMPLETED
                                                  ↑
     PAUSED ←──────────────────────────────→ (pausable/resumable)
```

**Key Methods**:

- `startSession(chatRoom, userId, question)`: Start a new session
- `next(sessionId)`: Advance to the next AI speaker
- `pause(sessionId)`: Pause the session
- `resume(sessionId)`: Resume the session
- `skip(sessionId)`: Skip the current speaker
- `supplement(sessionId, aiMemberId, followUp)`: Ask supplemental questions

#### 3. Storage Layer

Current implementation uses in-memory storage. For production, consider replacing with persistent storage (Redis, PostgreSQL).

**Data Models**:

- **ChatRoom**: Chat room containing multiple AI members
- **SequentialSession**: Session instance tracking speaking progress
- **Message**: Message records supporting parent-child relationships (for supplemental Q&A)

### API Documentation

See the Chinese version above for detailed API documentation.

### Development Workflow

#### 1. Adding a New AI Adapter

1. Create a new file in `src/ai/adapters/`, e.g., `G4FAdapter.ts`
2. Implement the `AIAdapter` interface
3. Register the adapter in `SequentialSessionService.ts`
4. Write unit tests

Example: See [G4F_INTEGRATION.md](./G4F_INTEGRATION.md)

#### 2. Modifying Session Logic

Core logic is in `SequentialSessionService.ts`. When modifying:

- Maintain correct state machine transitions
- Ensure all async operations handle errors properly
- Update related unit tests

#### 3. Extending API Endpoints

Add new routes in `src/http/server.ts`

#### 4. Replacing Storage Layer

To use persistent storage:

1. Create a new storage implementation with the same interface as `InMemoryStore`
2. Update `src/storage/` exports
3. Configure database connections
4. Migrate test cases

### Testing Guide

#### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Generate coverage report
npm test -- --coverage
```

#### Writing Tests

Test files are located in the `tests/` directory using Vitest framework.

### Deployment Guide

#### Using Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

Build and run:

```bash
docker build -t ai-chat .
docker run -p 3000:3000 ai-chat
```

#### Environment Variables

```bash
PORT=3000              # Service port
NODE_ENV=production    # Runtime environment
```

#### Production Recommendations

1. **Use Process Manager**: PM2 or systemd
2. **Configure Reverse Proxy**: Nginx or Caddy
3. **Enable HTTPS**: Use Let's Encrypt
4. **Configure Log Collection**: Winston + ELK Stack
5. **Monitoring and Alerting**: Prometheus + Grafana
6. **Persistent Storage**: Replace InMemoryStore with database

---

## 相关文档 / Related Documentation

- [G4F Integration Guide / G4F 对接指南](./G4F_INTEGRATION.md)
- [README](./README.md)

## 贡献 / Contributing

欢迎提交 Pull Request 和 Issue！

Welcome to submit Pull Requests and Issues!

## 许可证 / License

MIT
