// Types
export type {
  ContentBlock,
  SourceRange,
  MindCtxNode,
  MindCtxTree,
  PartialOperation,
  Operation,
  ParseOptions,
  SerializeOptions,
  MindMapDirection,
} from './types.js';

// Parser
export { parse } from './parser.js';

// Serializer
export { serialize, serializeSubtree } from './serializer.js';

// Operations
export {
  applyOperation,
  findNode,
  findParent,
  findIndex,
  getAbsoluteDepth,
  recalculateNodeTypes,
} from './operations.js';

// Undo
export { invertOperation, UndoManager } from './undo.js';

// Hash
export { fnv1a64, generateNodeId } from './hash.js';

// Importers
export { importOPML } from './importers/opml.js';
export { importFreeMind } from './importers/freemind.js';

// Exporters
export { exportOPML } from './exporters/opml.js';
export { exportJSON } from './exporters/json.js';

// AI
export { copyAsAIContext } from './ai/contextBuilder.js';

// Bridge (browser-only, import from '@mindctx/core/bridge')
// Re-exported via separate subpath to avoid pulling in mind-elixir in Node environments

// Utils
export { debounce } from './utils/debounce.js';
