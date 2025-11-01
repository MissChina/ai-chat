# Examples / 示例代码

This directory contains example code demonstrating how to use various features of the AI Chat project.

本目录包含演示如何使用 AI Chat 项目各种功能的示例代码。

## Available Examples / 可用示例

### g4f-adapter-example.ts

Demonstrates how to implement and use the G4F (GPT4Free) adapter to integrate free AI models into the AI Chat project.

演示如何实现和使用 G4F (GPT4Free) 适配器，将免费 AI 模型集成到 AI Chat 项目中。

**Features demonstrated / 演示功能**:
- G4F adapter implementation / G4F 适配器实现
- Basic message sending / 基本消息发送
- Streaming responses / 流式响应
- Integration with SequentialSessionService / 与顺序会话服务的集成
- Multi-model chat room configuration / 多模型聊天室配置

**Prerequisites / 前提条件**:
```bash
# Install G4F
pip install -U g4f

# Start G4F API server
python -m g4f.api --port 1337
```

**Running the example / 运行示例**:
```bash
# Using tsx (recommended for development)
npx tsx examples/g4f-adapter-example.ts

# Or compile and run
npm run build
node dist/examples/g4f-adapter-example.js
```

## How to Use These Examples / 如何使用这些示例

1. **Read the code comments** - Each example is heavily commented to explain what's happening
   
   **阅读代码注释** - 每个示例都有详细的注释来解释发生了什么

2. **Modify as needed** - Feel free to adapt the examples to your specific use case
   
   **根据需要修改** - 随意调整示例以适应你的特定用例

3. **Reference the main documentation** - For more details, see:
   - [DEVELOPMENT.md](../DEVELOPMENT.md) - Development guide
   - [G4F_INTEGRATION.md](../G4F_INTEGRATION.md) - G4F integration guide
   - [README.md](../README.md) - Project overview
   
   **参考主要文档** - 获取更多详细信息，请参阅：
   - [DEVELOPMENT.md](../DEVELOPMENT.md) - 开发指南
   - [G4F_INTEGRATION.md](../G4F_INTEGRATION.md) - G4F 集成指南
   - [README.md](../README.md) - 项目概述

## Contributing Examples / 贡献示例

If you've created a useful example, consider contributing it:

如果你创建了有用的示例，请考虑贡献它：

1. Create a new `.ts` file in this directory
   
   在此目录中创建一个新的 `.ts` 文件

2. Add clear comments explaining what the example demonstrates
   
   添加清晰的注释解释示例演示的内容

3. Update this README to include your example
   
   更新此 README 以包含你的示例

4. Submit a pull request
   
   提交 pull request

## License / 许可证

MIT
