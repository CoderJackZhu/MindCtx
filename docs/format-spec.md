# mind.md 格式规范

MindCtx 使用标准 Markdown 作为数据格式。本文档定义 `.mind.md` 文件的完整规范。

## 文件识别

一个 Markdown 文件通过以下两种方式被识别为 MindCtx 文档：

1. 文件扩展名为 `.mind.md`
2. 任意 `.md` 文件的 YAML frontmatter 中包含 `mindctx: true`

## Frontmatter

```yaml
---
mindctx: true
default-view: outline
heading-depth: 3
---
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mindctx` | boolean | — | 标记文件为 MindCtx 文档（非 `.mind.md` 文件必填） |
| `default-view` | string | `"outline"` | 默认打开的视图，可选 `"outline"` 或 `"mindmap"` |
| `heading-depth` | integer | `3` | 标题最大深度（1–6），超过此深度的节点序列化为列表项 |

## 树结构映射

MindCtx 将 Markdown 解析为树形结构。映射规则如下：

### 标题 → 分支节点

标题级别决定节点在树中的层级位置：

```markdown
# 根标题          ← 深度 1
## 一级分支        ← 深度 2
### 二级分支       ← 深度 3
```

解析器使用栈来确定父子关系：遇到新标题时，弹出栈中所有层级 ≥ 当前标题的节点，将新节点作为栈顶节点的子节点。

### 列表 → 叶节点

标题下方的列表成为该标题的子节点，列表嵌套产生更深层级：

```markdown
## 功能列表

- 第一项              ← 列表深度 1
  - 子项 A            ← 列表深度 2
    - 子子项          ← 列表深度 3
- 第二项              ← 列表深度 1
```

### heading-depth 边界

`heading-depth` 控制标题和列表的分界线：

- 深度 ≤ `heading-depth` 的节点序列化为 Markdown 标题（`#`、`##`、`###`…）
- 深度 > `heading-depth` 的节点序列化为列表项（`- item`）

示例：`heading-depth: 2` 时，只有 H1 和 H2 使用标题格式，更深层级全部使用列表。

## 节点类型

每个节点有两种类型：

| nodeType | 说明 | 语法 |
|----------|------|------|
| `heading` | 标题节点 | `# 标题`、`## 标题` 等 |
| `list-item` | 列表项节点 | `- 内容`、`1. 内容` 等 |

## 节点属性

### 标题（title）

节点的主要文本内容。

- 标题节点：`#` 后的文本
- 列表项节点：列表项的第一个段落

支持行内格式：`**粗体**`、`*斜体*`、`` `代码` ``、`[链接](url)`、`~~删除线~~`、`$数学$`。

### 备注（note）

节点的附加文本内容。

- 标题节点：标题下方、下一个标题或列表之前的段落
- 列表项节点：列表项中第一个段落之后的段落

```markdown
## 项目背景

这段文字是"项目背景"节点的备注内容。
可以有多个段落。

## 下一节
```

### 内容块（blocks）

附着在节点上的结构化内容，包括：

| 类型 | 说明 | 示例 |
|------|------|------|
| `code` | 代码块 | ` ```js ... ``` ` |
| `blockquote` | 引用块 | `> 引用内容` |
| `table` | 表格 | GFM 表格 |
| `image` | 图片 | `![alt](url)` |
| `html` | HTML 块 | `<div>...</div>` |
| `hr` | 分割线 | `---` |
| `math` | 数学公式块 | `$$...\n$$` |

```markdown
## API 设计

这是备注。

> 重要：接口需向后兼容

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /users | 获取用户列表 |

上面的引用块和表格都是"API 设计"节点的内容块。
```

### 复选框（checked）

列表项支持任务复选框，三态循环：

```markdown
- [ ] 待办事项          ← checked: false
- [x] 已完成事项        ← checked: true
- 普通列表项            ← checked: null
```

状态切换顺序：`null` → `false`（未选）→ `true`（已选）→ `null`（移除复选框）

### 有序列表（ordered）

```markdown
1. 第一步
2. 第二步
3. 第三步
```

有序列表项的 `ordered` 属性为 `true`，序列化时使用 `1.` 前缀。

### 标签（tags）

从标题文本中提取 `#tag` 格式的标签：

```markdown
## 功能设计 #important #v2
```

提取结果：`tags: ["important", "v2"]`

## 序列化规则

MindCtx 的序列化器遵循「最小变更」原则：

1. **未修改节点**：输出原始文本（`rawText`），保持用户的原始格式
2. **已修改节点**（`dirty: true`）：从结构化数据重新生成

### 标题节点生成规则

```
{"#".repeat(depth)} {title}\n\n
{note}\n\n          （如果有备注）
{blocks}            （如果有内容块）
```

### 列表项节点生成规则

```
{"  ".repeat(indent)}- {title}\n           （无序）
{"  ".repeat(indent)}- [ ] {title}\n       （未选中）
{"  ".repeat(indent)}- [x] {title}\n       （已选中）
{"  ".repeat(indent)}1. {title}\n          （有序）
```

列表项的备注和内容块会添加对应缩进。

## 节点 ID 生成

节点 ID 使用 FNV-1a 64-bit 哈希算法，基于标题路径和兄弟索引确定性生成：

```
ID = fnv1a64("祖先标题1/祖先标题2/当前标题:兄弟索引")
```

这保证了相同结构的文档在不同解析周期中产生稳定的节点 ID。

## 往返保真

核心保证：`serialize(parse(text)) === text`

只要不做任何修改操作，解析再序列化后的文本与原文完全一致。编辑操作只影响被修改节点的序列化输出，其他节点保持原始格式不变。

## 完整示例

```markdown
---
mindctx: true
default-view: outline
heading-depth: 3
---

# 产品需求文档：在线协作白板

## 一、项目背景

团队远程协作需求增长，现有工具无法满足实时头脑风暴场景。

## 二、用户画像

- 产品经理
  - 需求梳理
  - 用户旅程地图
- 设计师
  - 线框图绘制
  - 设计评审标注

## 三、核心功能

### 实时协作

- 多人同时编辑
  - 光标实时同步
  - 操作冲突处理（CRDT）
- 评论与标注
- 历史版本回溯

### 画布工具

- 基础图形
  - 矩形
  - 圆形
  - 箭头连接线

## 四、里程碑

- [ ] M1：基础画布 + 单人编辑（4 周）
- [ ] M2：实时协作（3 周）
- [x] M0：技术选型完成
```

此文档解析后的树结构：

```
根: "产品需求文档：在线协作白板" (heading, depth=1)
├── "一、项目背景" (heading, depth=2, note="团队远程协作需求增长...")
├── "二、用户画像" (heading, depth=2)
│   ├── "产品经理" (list-item)
│   │   ├── "需求梳理" (list-item)
│   │   └── "用户旅程地图" (list-item)
│   └── "设计师" (list-item)
│       ├── "线框图绘制" (list-item)
│       └── "设计评审标注" (list-item)
├── "三、核心功能" (heading, depth=2)
│   ├── "实时协作" (heading, depth=3)
│   │   ├── "多人同时编辑" (list-item)
│   │   │   ├── "光标实时同步" (list-item)
│   │   │   └── "操作冲突处理（CRDT）" (list-item)
│   │   ├── "评论与标注" (list-item)
│   │   └── "历史版本回溯" (list-item)
│   └── "画布工具" (heading, depth=3)
│       └── "基础图形" (list-item)
│           ├── "矩形" (list-item)
│           ├── "圆形" (list-item)
│           └── "箭头连接线" (list-item)
└── "四、里程碑" (heading, depth=2)
    ├── "M1：基础画布 + 单人编辑（4 周）" (list-item, checked=false)
    ├── "M2：实时协作（3 周）" (list-item, checked=false)
    └── "M0：技术选型完成" (list-item, checked=true)
```

## 与标准 Markdown 的兼容性

`.mind.md` 文件是合法的 Markdown，可以在任何 Markdown 编辑器中直接阅读和编辑。MindCtx 不引入任何私有语法，仅通过 frontmatter 中的 `mindctx: true` 和文件扩展名来标识。
