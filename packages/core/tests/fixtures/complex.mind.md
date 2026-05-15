---
mindctx: true
version: 1
default-view: outline
heading-depth: 4
---

# Agent 工程能力体系

Agent 工程能力体系主要包括工具调用、规划、记忆、RAG、评估和工程化部署。

## 一、工具调用

工具调用是 Agent 从"文本生成器"变成"任务执行器"的关键。

### Function Calling

- 参数 schema
- 参数校验
  - 类型检查
  - 范围检查
- 调用失败重试
- 工具结果归一化

### MCP

> MCP 是模型上下文协议，由 Anthropic 提出。

- MCP Server
- MCP Client
- Tools
- Resources
- Prompts

## 二、规划能力

### ReAct

- Thought
- Action
- Observation

### Plan-and-Execute

- Planner
- Executor
- Verifier

## 三、RAG

### 检索

- BM25
- Embedding
- Hybrid Search

### 重排

- Cross Encoder
- LLM Rerank

## 四、评估

- [ ] 自动评估流水线
- [x] 人工评估标准
- [ ] A/B 测试框架
