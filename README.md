# AI Chat Sequential Discussion MVP

[English](#english) | [中文](#中文)

---

## English

This repository contains a minimal backend implementation of the sequential AI discussion platform described in the MVP specification. It focuses on the server-side orchestration of sequential speaker turns, AI adapters (including G4F support), and HTTP endpoints that expose the primary workflows for experimentation.

## Features

- In-memory chat room management with configurable AI members and default demo data.
- Sequential session engine that streams AI responses in turn order.
- **Extensible AI adapter architecture** supporting multiple AI providers:
  - Mock adapter for testing
  - G4F (GPT4Free) adapter for free access to GPT-4, Claude, Llama, and more
  - Easy to add custom adapters for official APIs
- Manual advancement controls for "next", "pause", "resume", and "skip" actions that mirror the MVP specification.
- Supplementary follow-up support to extend an individual AI member's response.
- Express-based REST + SSE API for creating chat rooms, orchestrating sessions, and streaming runtime state.
- Vitest test coverage for the sequential engine and supplement workflow.

## Getting Started

```bash
npm install
npm run dev
```

The development server runs on [http://localhost:3000](http://localhost:3000). It exposes the following endpoints:

- `GET /api/chatrooms` – list chat rooms (creates a default room on first access).
- `POST /api/chatrooms` – create a new room with custom AI members.
- `POST /api/chatrooms/:chatRoomId/sessions` – start a new sequential session.
- `GET /api/sessions/:sessionId` – fetch the latest session state including messages.
- `POST /api/sessions/:sessionId/next` – advance to the next AI speaker when ready.
- `POST /api/sessions/:sessionId/pause` – pause the sequential session without advancing.
- `POST /api/sessions/:sessionId/resume` – resume a paused session (returns to `AI_FINISHED`).
- `POST /api/sessions/:sessionId/skip` – skip the upcoming AI speaker.
- `POST /api/sessions/:sessionId/supplement` – request a supplemental answer from an AI member.
- `GET /api/sessions/:sessionId/stream` – subscribe to Server-Sent Events for state, chunk, and completion updates.

Clients should subscribe to the SSE stream to mirror UI state transitions without deploying external infrastructure.

By default, AI replies are generated through the `MockAdapter`, which simulates latency and token accounting without external API calls. For real AI integration, see the [G4F Integration Guide](./G4F_INTEGRATION.md).

## Documentation

- 📘 **[Development Documentation](./DEVELOPMENT.md)** - Comprehensive guide covering architecture, development workflow, and API details
- 🚀 **[G4F Integration Guide](./G4F_INTEGRATION.md)** - Step-by-step guide to integrate G4F (GPT4Free) for free access to multiple AI models
- 📖 **[API Reference](./DEVELOPMENT.md#api-接口文档)** - Complete API endpoint documentation

## Testing

```bash
npm test
```

Vitest exercises the sequential progression and supplement flows to ensure the orchestration logic behaves as expected.

## Production Build

```bash
npm run build
npm start
```

This compiles the TypeScript source to JavaScript in `dist/` and runs the Express server.

## Architecture Overview

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/SSE
┌──────┴──────────────────┐
│   Express Server        │
│   - REST API            │
│   - SSE Streaming       │
└──────┬──────────────────┘
       │
┌──────┴──────────────────┐
│ Sequential Session      │
│ Service                 │
│ - State Management      │
│ - Speaker Orchestration │
└──────┬──────────────────┘
       │
┌──────┴──────────────────┐
│   AI Adapter Layer      │
│ ┌────────────────────┐  │
│ │  Mock Adapter      │  │
│ ├────────────────────┤  │
│ │  G4F Adapter       │  │
│ │  (GPT-4, Claude,   │  │
│ │   Llama, etc.)     │  │
│ ├────────────────────┤  │
│ │  Custom Adapters   │  │
│ └────────────────────┘  │
└─────────────────────────┘
```

For detailed architecture information, see [DEVELOPMENT.md](./DEVELOPMENT.md#架构设计).

## Key Concepts

### AI Adapters

The project uses an adapter pattern to support multiple AI providers:

- **MockAdapter**: Simulates AI responses for testing (default)
- **G4FAdapter**: Integrates with G4F for free access to GPT-4, Claude, Llama, and more
- **Custom Adapters**: Easy to implement for official APIs (OpenAI, Anthropic, etc.)

See [G4F_INTEGRATION.md](./G4F_INTEGRATION.md) for instructions on using real AI models.

### Sequential Sessions

Multiple AI models respond to questions in sequence, with full control over the conversation flow:

- Start a session with a question
- AI members respond one by one
- Pause, resume, or skip speakers as needed
- Request supplemental answers from specific AI members

## Contributing

Contributions are welcome! Please read [DEVELOPMENT.md](./DEVELOPMENT.md) for development guidelines.

## License

MIT

---

## 中文

这个仓库包含了顺序 AI 讨论平台的最小化后端实现。它专注于服务端的顺序发言编排、AI 适配器（包括 G4F 支持）以及 HTTP 端点，用于实验主要工作流程。

## 功能特性

- 内存聊天室管理，支持可配置的 AI 成员和默认演示数据
- 顺序会话引擎，按顺序流式传输 AI 响应
- **可扩展的 AI 适配器架构**，支持多个 AI 提供商：
  - 用于测试的模拟适配器
  - G4F (GPT4Free) 适配器，免费访问 GPT-4、Claude、Llama 等
  - 易于为官方 API 添加自定义适配器
- 手动推进控制："下一个"、"暂停"、"恢复"和"跳过"操作
- 补充问答支持，扩展单个 AI 成员的回复
- 基于 Express 的 REST + SSE API，用于创建聊天室、编排会话和流式传输运行时状态
- Vitest 测试覆盖顺序引擎和补充工作流

## 快速开始

```bash
npm install
npm run dev
```

开发服务器在 [http://localhost:3000](http://localhost:3000) 上运行。

## 文档

- 📘 **[开发文档](./DEVELOPMENT.md)** - 涵盖架构、开发工作流程和 API 详情的综合指南
- 🚀 **[G4F 集成指南](./G4F_INTEGRATION.md)** - 分步指南，集成 G4F (GPT4Free) 免费访问多个 AI 模型
- 📖 **[API 参考](./DEVELOPMENT.md#api-接口文档)** - 完整的 API 端点文档

## 架构概览

```
┌─────────────┐
│   客户端     │
└──────┬──────┘
       │ HTTP/SSE
┌──────┴──────────────────┐
│   Express 服务器        │
│   - REST API            │
│   - SSE 流式传输        │
└──────┬──────────────────┘
       │
┌──────┴──────────────────┐
│ 顺序会话服务             │
│ - 状态管理               │
│ - 发言者编排             │
└──────┬──────────────────┘
       │
┌──────┴──────────────────┐
│   AI 适配器层           │
│ ┌────────────────────┐  │
│ │  模拟适配器         │  │
│ ├────────────────────┤  │
│ │  G4F 适配器        │  │
│ │  (GPT-4, Claude,   │  │
│ │   Llama 等)        │  │
│ ├────────────────────┤  │
│ │  自定义适配器       │  │
│ └────────────────────┘  │
└─────────────────────────┘
```

详细架构信息请参阅 [DEVELOPMENT.md](./DEVELOPMENT.md#架构设计)。

## 核心概念

### AI 适配器

项目使用适配器模式支持多个 AI 提供商：

- **MockAdapter**: 模拟 AI 响应用于测试（默认）
- **G4FAdapter**: 集成 G4F，免费访问 GPT-4、Claude、Llama 等
- **自定义适配器**: 易于为官方 API（OpenAI、Anthropic 等）实现

使用真实 AI 模型的说明请参阅 [G4F_INTEGRATION.md](./G4F_INTEGRATION.md)。

### 顺序会话

多个 AI 模型按顺序回答问题，完全控制对话流程：

- 用问题启动会话
- AI 成员逐个响应
- 根据需要暂停、恢复或跳过发言者
- 向特定 AI 成员请求补充答案

## 测试

```bash
npm test
```

## 生产构建

```bash
npm run build
npm start
```

## 贡献

欢迎贡献！请阅读 [DEVELOPMENT.md](./DEVELOPMENT.md) 了解开发指南。

## 许可证

MIT
