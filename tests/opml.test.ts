import { describe, expect, test } from 'vitest';
import { exportOPML, importOPML, parse } from '@minddoc/core';
import type { MindDocNode, MindDocTree } from '@minddoc/core';

class TestElement {
  tagName: string;
  attributes: Map<string, string>;
  children: TestElement[] = [];
  private text = '';

  constructor(tagName: string, attributes: Map<string, string> = new Map()) {
    this.tagName = tagName;
    this.attributes = attributes;
  }

  get textContent(): string {
    return this.text + this.children.map(child => child.textContent).join('');
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendText(text: string): void {
    this.text += decodeXml(text);
  }

  querySelector(selector: string): TestElement | null {
    if (selector.includes('>')) {
      const [parentTag, childTag] = selector.split('>').map(part => part.trim().toLowerCase());
      for (const parent of this.findAll(parentTag, true)) {
        const child = parent.children.find(candidate => candidate.tagName.toLowerCase() === childTag);
        if (child) return child;
      }
      return null;
    }

    return this.findAll(selector.toLowerCase(), true)[0] ?? null;
  }

  private findAll(tagName: string, includeSelf = false): TestElement[] {
    const matches: TestElement[] = [];
    if (includeSelf && this.tagName.toLowerCase() === tagName) matches.push(this);
    for (const child of this.children) {
      matches.push(...child.findAll(tagName, true));
    }
    return matches;
  }
}

class TestDocument {
  children: TestElement[];

  constructor(children: TestElement[]) {
    this.children = children;
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) return match;
    }
    return null;
  }
}

class TestDOMParser {
  parseFromString(source: string): TestDocument {
    try {
      return parseXml(source);
    } catch (error) {
      const parsererror = new TestElement('parsererror');
      parsererror.appendText(error instanceof Error ? error.message : String(error));
      return new TestDocument([parsererror]);
    }
  }
}

(globalThis as typeof globalThis & { DOMParser: typeof DOMParser }).DOMParser =
  TestDOMParser as unknown as typeof DOMParser;

function parseXml(source: string): TestDocument {
  const roots: TestElement[] = [];
  const stack: TestElement[] = [];
  const tokens = source.match(/<[^>]*>|[^<]+/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;

    if (token.startsWith('</')) {
      const tagName = token.slice(2, -1).trim().toLowerCase();
      const current = stack.pop();
      if (!current || current.tagName.toLowerCase() !== tagName) {
        throw new Error(`Unexpected closing tag: ${tagName}`);
      }
      continue;
    }

    if (token.startsWith('<')) {
      if (token.startsWith('<!')) continue;

      const selfClosing = token.endsWith('/>');
      const content = token.slice(1, selfClosing ? -2 : -1).trim();
      const tagName = content.match(/^[^\s/>]+/)?.[0];
      if (!tagName) throw new Error('Missing tag name');

      const element = new TestElement(tagName, parseAttributes(content.slice(tagName.length)));
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(element);
      } else {
        roots.push(element);
      }

      if (!selfClosing) stack.push(element);
      continue;
    }

    const parent = stack[stack.length - 1];
    if (parent) parent.appendText(token);
  }

  if (stack.length > 0) {
    throw new Error(`Unclosed tag: ${stack[stack.length - 1].tagName}`);
  }

  if (roots.length !== 1) {
    throw new Error('XML must contain a single root element');
  }

  return new TestDocument(roots);
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(/([^\s=/>]+)\s*=\s*"([^"]*)"/g)) {
    attributes.set(match[1], decodeXml(match[2]));
  }
  return attributes;
}

function decodeXml(source: string): string {
  return source
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function makeTree(root: NodeInput): MindDocTree {
  let id = 0;

  function makeNode(input: NodeInput, headingLevel: number): MindDocNode {
    return {
      id: String(id++),
      title: input.title,
      note: input.note ?? '',
      blocks: [],
      children: (input.children ?? []).map(child => makeNode(child, headingLevel + 1)),
      nodeType: 'heading',
      headingLevel,
      listDepth: 0,
      checked: null,
      tags: [],
      ordered: false,
      sourceRange: { startLine: 0, endLine: 0 },
      rawText: '',
      dirty: false,
      subtreeDirty: false,
    };
  }

  return {
    version: 1,
    filePath: '',
    frontmatter: {},
    rawFrontmatter: '',
    headingDepth: 3,
    root: makeNode(root, 0),
    metadata: { parseTime: 0, nodeCount: 0, maxDepth: 0 },
  };
}

interface NodeInput {
  title: string;
  note?: string;
  children?: NodeInput[];
}

function topOutline(xml: string): TestElement {
  const doc = new DOMParser().parseFromString(xml, 'text/xml') as unknown as TestDocument;
  expect(doc.querySelector('parsererror')).toBeNull();
  const body = doc.querySelector('body');
  expect(body).not.toBeNull();
  const outline = body!.children.find(child => child.tagName.toLowerCase() === 'outline');
  expect(outline).toBeDefined();
  return outline!;
}

describe('exportOPML', () => {
  test('emits valid XML and preserves titles and hierarchy', () => {
    const opml = exportOPML(makeTree({
      title: 'Project',
      children: [
        { title: 'Research', children: [{ title: 'Interview' }] },
        { title: 'Build' },
      ],
    }));

    const root = topOutline(opml);
    expect(root.getAttribute('text')).toBe('Project');
    expect(root.children.map(child => child.getAttribute('text'))).toEqual(['Research', 'Build']);
    expect(root.children[0].children[0].getAttribute('text')).toBe('Interview');
  });

  test('escapes special characters and includes note attribute', () => {
    const title = 'A&B <C> "D" \'E\'';
    const note = 'Note with & < > " and \' characters';
    const opml = exportOPML(makeTree({
      title: 'Root',
      children: [{ title, note }],
    }));

    expect(opml).toContain('A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
    expect(opml).toContain('_note="Note with &amp; &lt; &gt; &quot; and &apos; characters"');

    const root = topOutline(opml);
    expect(root.children[0].getAttribute('text')).toBe(title);
    expect(root.children[0].getAttribute('_note')).toBe(note);
  });
});

describe('importOPML', () => {
  test('parses OPML outlines into MindDoc markdown with notes', () => {
    const markdown = importOPML(`<?xml version="1.0"?>
<opml version="2.0">
  <head><title>Fallback</title></head>
  <body>
    <outline text="Root">
      <outline text="Child" _note="Child note"/>
    </outline>
  </body>
</opml>`, 'fallback.mind.md');

    expect(markdown).toContain('minddoc: true');
    expect(markdown).toContain('# Root');
    expect(markdown).toContain('## Child');
    expect(markdown).toContain('Child note');
  });

  test('throws on invalid XML', () => {
    expect(() => importOPML('<opml><body><outline></body></opml>', 'bad.opml'))
      .toThrow('OPML 解析失败');
  });

  test('handles a single top-level outline as the document root', () => {
    const markdown = importOPML('<opml><body><outline text="Only Root"><outline text="Child"/></outline></body></opml>', 'single.opml');

    expect(markdown).toContain('# Only Root');
    expect(markdown).toContain('## Child');
  });

  test('handles multiple top-level outlines under the OPML title', () => {
    const markdown = importOPML('<opml><head><title>Document Title</title></head><body><outline text="One"/><outline text="Two"/></body></opml>', 'multi.opml');

    expect(markdown).toContain('# Document Title');
    expect(markdown).toContain('## One');
    expect(markdown).toContain('## Two');
  });

  test('handles deep nesting beyond heading depth as nested lists', () => {
    const markdown = importOPML('<opml><body><outline text="Root"><outline text="A"><outline text="B"><outline text="C"><outline text="D"/></outline></outline></outline></outline></body></opml>', 'deep.opml');

    expect(markdown).toContain('# Root');
    expect(markdown).toContain('## A');
    expect(markdown).toContain('### B');
    expect(markdown).toContain('- C');
    expect(markdown).toContain('  - D');
  });

  test('handles empty text and notes', () => {
    const markdown = importOPML('<opml><body><outline text="Root"><outline text="" _note="Empty title note"/></outline></body></opml>', 'empty.opml');

    expect(markdown).toContain('## \n\n');
    expect(markdown).toContain('Empty title note');
  });
});

describe('OPML roundtrip', () => {
  test('import then export preserves structure', () => {
    const imported = importOPML('<opml><body><outline text="Root"><outline text="A"><outline text="B"/></outline><outline text="C" _note="Note C"/></outline></body></opml>', 'roundtrip.opml');
    const exported = exportOPML(parse(imported));
    const root = topOutline(exported);
    const importedRoot = root.children[0];

    expect(importedRoot.getAttribute('text')).toBe('Root');
    expect(importedRoot.children.map(child => child.getAttribute('text'))).toEqual(['A', 'C']);
    expect(importedRoot.children[0].children[0].getAttribute('text')).toBe('B');
    expect(importedRoot.children[1].getAttribute('_note')).toBe('Note C');
  });
});
