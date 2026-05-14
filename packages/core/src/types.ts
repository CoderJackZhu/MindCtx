export interface ContentBlock {
  type: 'code' | 'blockquote' | 'image' | 'html' | 'hr' | 'table' | 'math';
  raw: string;
  language?: string;
  alt?: string;
}

export interface SourceRange {
  startLine: number;
  endLine: number;
}

export interface MindCtxNode {
  id: string;
  title: string;
  note: string;
  blocks: ContentBlock[];
  children: MindCtxNode[];
  nodeType: 'heading' | 'list-item';
  headingLevel: number;
  listDepth: number;
  checked: boolean | null;
  tags: string[];
  ordered: boolean;
  sourceRange: SourceRange;
  rawText: string;
  dirty: boolean;
  subtreeDirty: boolean;
}

export interface MindCtxTree {
  version: 1;
  filePath: string;
  frontmatter: Record<string, unknown>;
  rawFrontmatter: string;
  headingDepth: number;
  root: MindCtxNode;
  metadata: {
    parseTime: number;
    nodeCount: number;
    maxDepth: number;
  };
}

export type PartialOperation =
  | { type: 'move'; nodeId: string; newParentId: string; index: number }
  | { type: 'rename'; nodeId: string; newTitle: string }
  | { type: 'create'; parentId: string; index: number; title: string }
  | { type: 'delete'; nodeId: string }
  | { type: 'indent'; nodeId: string }
  | { type: 'outdent'; nodeId: string }
  | { type: 'toggleCheck'; nodeId: string }
  | { type: 'updateNote'; nodeId: string; note: string }
  | { type: 'moveUp'; nodeId: string }
  | { type: 'moveDown'; nodeId: string };

export type Operation =
  | { type: 'move'; nodeId: string; newParentId: string; index: number; oldParentId: string; oldIndex: number }
  | { type: 'rename'; nodeId: string; newTitle: string; oldTitle: string }
  | { type: 'create'; parentId: string; index: number; node: MindCtxNode }
  | { type: 'delete'; nodeId: string; parentId: string; index: number; deletedNode: MindCtxNode }
  | { type: 'indent'; nodeId: string; oldParentId: string; oldIndex: number }
  | { type: 'outdent'; nodeId: string; oldParentId: string; oldIndex: number; adoptedSiblingIds: string[] }
  | {
      type: 'toggleCheck';
      nodeId: string;
      oldValue: boolean | null;
      newValue?: boolean | null;
      oldNodeType?: MindCtxNode['nodeType'];
      oldHeadingLevel?: number;
      oldListDepth?: number;
      newNodeType?: MindCtxNode['nodeType'];
      newHeadingLevel?: number;
      newListDepth?: number;
    }
  | { type: 'updateNote'; nodeId: string; note: string; oldNote: string }
  | { type: 'moveUp'; nodeId: string }
  | { type: 'moveDown'; nodeId: string };

export interface ParseOptions {
  filePath?: string;
  defaultHeadingDepth?: number;
}

export interface SerializeOptions {
  headingDepth?: number;
}

export type MindMapDirection = 'side' | 'left' | 'right';
