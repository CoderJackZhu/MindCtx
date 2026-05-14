import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse } from '@minddoc/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('Parser', () => {
  test('解析简单标题结构', () => {
    const tree = parse(fixture('simple.mind.md'));
    expect(tree.root.children.length).toBe(1); // One H1
    const h1 = tree.root.children[0];
    expect(h1.title).toBe('项目规划');
    expect(h1.nodeType).toBe('heading');
    expect(h1.headingLevel).toBe(1);
    expect(h1.children.length).toBe(2); // Two H2s
    expect(h1.children[0].title).toBe('需求分析');
    expect(h1.children[1].title).toBe('技术方案');
  });

  test('解析嵌套列表', () => {
    const tree = parse(fixture('complex.mind.md'));
    // H1 > H2(一、工具调用) > H3(Function Calling)
    const functionCalling = tree.root.children[0].children[0].children[0];
    expect(functionCalling.title).toBe('Function Calling');
    // Function Calling has list items: 参数 schema, 参数校验, 调用失败重试, 工具结果归一化
    const paramValidation = functionCalling.children[1]; // 参数校验
    expect(paramValidation.title).toBe('参数校验');
    expect(paramValidation.children.length).toBe(2); // 类型检查, 范围检查
    expect(paramValidation.children[0].title).toBe('类型检查');
    expect(paramValidation.children[1].title).toBe('范围检查');
  });

  test('解析混合标题+列表', () => {
    const tree = parse(fixture('simple.mind.md'));
    const h2 = tree.root.children[0].children[0]; // 需求分析
    expect(h2.children.length).toBe(2);
    expect(h2.children[0].nodeType).toBe('list-item');
    expect(h2.children[0].title).toBe('用户调研');
    expect(h2.children[1].title).toBe('竞品分析');
  });

  test('段落归属为 note', () => {
    const tree = parse(fixture('complex.mind.md'));
    const h1 = tree.root.children[0];
    expect(h1.note).toContain('Agent 工程能力体系主要包括');
  });

  test('代码块归属为 blocks', () => {
    const md = '# Test\n\n```js\nconsole.log("hi")\n```\n';
    const tree = parse(md);
    expect(tree.root.children[0].blocks.length).toBe(1);
    expect(tree.root.children[0].blocks[0].type).toBe('code');
    expect(tree.root.children[0].blocks[0].language).toBe('js');
  });

  test('引用块归属为 blocks', () => {
    const tree = parse(fixture('complex.mind.md'));
    // MCP is H3 under H2(一、工具调用), second H3
    const mcp = tree.root.children[0].children[0].children[1]; // MCP
    expect(mcp.blocks.length).toBe(1);
    expect(mcp.blocks[0].type).toBe('blockquote');
    expect(mcp.blocks[0].raw).toContain('MCP 是模型上下文协议');
  });

  test('标题跳级（H1→H3）', () => {
    const tree = parse(fixture('heading-jump.mind.md'));
    const h1 = tree.root.children[0];
    expect(h1.title).toBe('根节点');
    // H3 is direct child of H1 (no virtual H2 inserted)
    expect(h1.children[0].title).toBe('跳级到三级');
    expect(h1.children[0].headingLevel).toBe(3);
  });

  test('标题跳级结构完整性', () => {
    const tree = parse(fixture('heading-jump.mind.md'));
    const h1 = tree.root.children[0];
    // H1 > H3(跳级到三级) > H5(跳级到五级)
    // H1 > H2(回到二级) with list items
    const h3 = h1.children[0];
    expect(h3.children[0].title).toBe('跳级到五级');
    expect(h3.children[0].headingLevel).toBe(5);
    const h2 = h1.children[1];
    expect(h2.title).toBe('回到二级');
    expect(h2.headingLevel).toBe(2);
    expect(h2.children.length).toBe(2); // 列表项A, 列表项B
  });

  test('多个 H1 并列', () => {
    const md = '# First\n\n# Second\n\n# Third\n';
    const tree = parse(md);
    expect(tree.root.children.length).toBe(3);
    expect(tree.root.children[0].title).toBe('First');
    expect(tree.root.children[1].title).toBe('Second');
    expect(tree.root.children[2].title).toBe('Third');
  });

  test('首标题前有内容', () => {
    const md = 'Some intro text.\n\n# Main\n\nContent.\n';
    const tree = parse(md);
    expect(tree.root.note).toBe('Some intro text.');
    expect(tree.root.children[0].title).toBe('Main');
  });

  test('空文件', () => {
    const tree = parse(fixture('empty.mind.md'));
    expect(tree.root.children.length).toBe(0);
  });

  test('纯列表无标题', () => {
    const tree = parse(fixture('list-only.mind.md'));
    expect(tree.root.children.length).toBe(2);
    expect(tree.root.children[0].title).toBe('没有标题的文档');
    expect(tree.root.children[0].nodeType).toBe('list-item');
    expect(tree.root.children[0].children.length).toBe(2); // 子项 A, 子项 B
    expect(tree.root.children[0].children[1].children.length).toBe(1); // 孙项 B1
  });

  test('任务列表解析 checked 状态', () => {
    const tree = parse(fixture('complex.mind.md'));
    // 四、评估 is the 4th H2 under H1 (index 3)
    const evaluation = tree.root.children[0].children[3]; // 四、评估
    expect(evaluation.title).toBe('四、评估');
    expect(evaluation.children[0].checked).toBe(false); // [ ] 自动评估流水线
    expect(evaluation.children[1].checked).toBe(true);  // [x] 人工评估标准
    expect(evaluation.children[2].checked).toBe(false); // [ ] A/B 测试框架
  });

  test('frontmatter 正确提取', () => {
    const tree = parse(fixture('complex.mind.md'));
    expect(tree.frontmatter['minddoc']).toBe(true);
    expect(tree.frontmatter['version']).toBe(1);
    expect(tree.frontmatter['default-view']).toBe('outline');
    expect(tree.frontmatter['heading-depth']).toBe(3);
  });

  test('无 frontmatter 使用默认值', () => {
    const tree = parse(fixture('no-frontmatter.mind.md'));
    expect(tree.frontmatter).toEqual({});
    expect(tree.headingDepth).toBe(3);
    expect(tree.rawFrontmatter).toBe('');
  });

  test('heading-depth 正确读取', () => {
    const tree = parse(fixture('complex.mind.md'));
    expect(tree.headingDepth).toBe(3);
  });

  test('heading-depth 优先级: frontmatter > options > default', () => {
    // frontmatter has heading-depth: 3 in complex.mind.md
    const tree1 = parse(fixture('complex.mind.md'), { defaultHeadingDepth: 6 });
    expect(tree1.headingDepth).toBe(3); // frontmatter wins

    // no-frontmatter.mind.md has no heading-depth
    const tree2 = parse(fixture('no-frontmatter.mind.md'), { defaultHeadingDepth: 5 });
    expect(tree2.headingDepth).toBe(5); // options win

    // no frontmatter, no options => default 3
    const tree3 = parse(fixture('no-frontmatter.mind.md'));
    expect(tree3.headingDepth).toBe(3);
  });

  test('heading-depth 会解析字符串并限制在 1 到 6', () => {
    expect(parse('---\nheading-depth: "5"\n---\n\n# Title\n').headingDepth).toBe(5);
    expect(parse('---\nheading-depth: 99\n---\n\n# Title\n').headingDepth).toBe(6);
    expect(parse('---\nheading-depth: invalid\n---\n\n# Title\n').headingDepth).toBe(3);
  });

  test('节点 ID 不重复', () => {
    const tree = parse(fixture('complex.mind.md'));
    const ids = new Set<string>();
    function collectIds(node: any) {
      if (node.id) {
        expect(ids.has(node.id)).toBe(false);
        ids.add(node.id);
      }
      for (const child of node.children) collectIds(child);
    }
    collectIds(tree.root);
    expect(ids.size).toBeGreaterThan(0);
  });

  test('tags 从标题中提取 #tag', () => {
    const md = '# Project #important #urgent\n';
    const tree = parse(md);
    expect(tree.root.children[0].tags).toContain('important');
    expect(tree.root.children[0].tags).toContain('urgent');
  });

  test('有序列表设 ordered: true', () => {
    const md = '# Test\n\n1. First\n2. Second\n';
    const tree = parse(md);
    expect(tree.root.children[0].children[0].ordered).toBe(true);
    expect(tree.root.children[0].children[1].ordered).toBe(true);
  });

  test('无序列表设 ordered: false', () => {
    const tree = parse(fixture('simple.mind.md'));
    const h2 = tree.root.children[0].children[0]; // 需求分析
    expect(h2.children[0].ordered).toBe(false);
    expect(h2.children[1].ordered).toBe(false);
  });

  test('nodeCount 统计正确', () => {
    const tree = parse(fixture('simple.mind.md'));
    // root(1) + H1(1) + 2 H2s(2) + 4 list items(4) = 8
    expect(tree.metadata.nodeCount).toBe(8);
  });

  test('sourceRange startLine 正确', () => {
    const tree = parse(fixture('simple.mind.md'));
    const h1 = tree.root.children[0];
    expect(h1.sourceRange.startLine).toBeGreaterThanOrEqual(0);
    // simple.mind.md: lines 0:--- 1:minddoc:true 2:--- 3:(empty) 4:# 项目规划
    expect(h1.sourceRange.startLine).toBe(4);
  });

  test('H2 下段落归属为该 H2 的 note', () => {
    const tree = parse(fixture('complex.mind.md'));
    const h2Tools = tree.root.children[0].children[0]; // 一、工具调用
    expect(h2Tools.note).toContain('工具调用是 Agent 从"文本生成器"变成"任务执行器"的关键');
  });

  test('list-item 的 checked 非任务项为 null', () => {
    const tree = parse(fixture('simple.mind.md'));
    const listItem = tree.root.children[0].children[0].children[0]; // 用户调研
    expect(listItem.checked).toBeNull();
  });

  test('list-item 的 listDepth 正确', () => {
    const tree = parse(fixture('complex.mind.md'));
    // Function Calling > 参数校验 (depth 1) > 类型检查 (depth 2)
    const functionCalling = tree.root.children[0].children[0].children[0];
    const paramValidation = functionCalling.children[1]; // 参数校验
    expect(paramValidation.listDepth).toBe(1);
    expect(paramValidation.children[0].listDepth).toBe(2); // 类型检查
  });

  test('virtual root 的 headingLevel 为 0', () => {
    const tree = parse(fixture('simple.mind.md'));
    expect(tree.root.headingLevel).toBe(0);
    expect(tree.root.nodeType).toBe('heading');
  });
});
