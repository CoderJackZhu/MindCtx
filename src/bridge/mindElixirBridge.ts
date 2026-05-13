import type { MindDocTree, MindDocNode, PartialOperation } from '../core/types.js';
import MindElixir from 'mind-elixir';
import type { NodeObj, MindElixirData, MindElixirInstance, Operation as MEOperation } from 'mind-elixir';
import type { MindDocSettings } from '../settings/settings.js';

type MindElixirTopicElement = HTMLElement & { nodeObj?: NodeObj };
export type MindMapDirection = MindDocSettings['mindmapDirection'];

export function getMindElixirDirection(direction: MindMapDirection): number {
  switch (direction) {
    case 'left':
      return MindElixir.LEFT;
    case 'right':
      return MindElixir.RIGHT;
    case 'side':
    default:
      return MindElixir.SIDE;
  }
}

export function treeToMindElixirData(
  tree: MindDocTree,
  collapsedIds: Set<string>,
  direction: MindMapDirection,
  focusNodeId?: string | null
): MindElixirData {
  function findMindDocNode(node: MindDocNode, id: string): MindDocNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findMindDocNode(child, id);
      if (found) return found;
    }
    return null;
  }

  function getTopLevelDirection(index: number): 0 | 1 {
    switch (direction) {
      case 'left':
        return 0;
      case 'right':
        return 1;
      case 'side':
      default:
        return index % 2 === 0 ? 0 : 1;
    }
  }

  function convert(node: MindDocNode, isTopLevel: boolean, index: number): NodeObj {
    const data: NodeObj = {
      id: node.id,
      topic: node.title || '(空节点)',
      expanded: !collapsedIds.has(node.id),
      tags: node.tags.length > 0 ? node.tags : undefined,
      note: node.note || undefined,
    };

    if (isTopLevel) {
      data.direction = getTopLevelDirection(index);
    }

    if (node.children.length > 0) {
      data.children = node.children.map((child, i) => convert(child, false, i));
    }

    return data;
  }

  const focusNode = focusNodeId ? findMindDocNode(tree.root, focusNodeId) : null;
  if (focusNode) {
    return {
      direction: getMindElixirDirection(direction),
      nodeData: {
        id: focusNode.id,
        topic: focusNode.title || '(空节点)',
        expanded: true,
        tags: focusNode.tags.length > 0 ? focusNode.tags : undefined,
        note: focusNode.note || undefined,
        children: focusNode.children.map((child, i) => convert(child, true, i)),
      },
    };
  }

  const rootData: NodeObj = {
    id: tree.root.id,
    topic: tree.root.title || tree.filePath.replace(/.*\//, '').replace(/\.mind\.md$/, '').replace(/\.md$/, ''),
    expanded: true,
    children: tree.root.children.map((child, i) => convert(child, true, i)),
  };

  return { direction: getMindElixirDirection(direction), nodeData: rootData };
}

export function syncMindElixirAddChildButtons(
  instance: MindElixirInstance
): void {
  const topics = instance.container.querySelectorAll<MindElixirTopicElement>(
    'me-root > me-tpc, me-parent > me-tpc'
  );

  topics.forEach(topic => {
    if (!topic.nodeObj && topic.parentElement?.tagName === 'ME-ROOT') {
      topic.nodeObj = instance.nodeData;
    }
    if (!topic.nodeObj || topic.querySelector(':scope > .minddoc-mindmap-add-child')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'minddoc-mindmap-add-child';
    button.textContent = '+';
    button.setAttribute('aria-label', '添加子节点');
    button.setAttribute('title', '添加子节点');

    const handleAddChild = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      void instance.addChild(topic as unknown as import('mind-elixir').Topic);
    };

    button.addEventListener('click', handleAddChild);
    button.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
    });

    topic.appendChild(button);
  });
}

export function setupMindElixirEvents(
  instance: MindElixirInstance,
  onOperation: (op: PartialOperation) => void,
  onCollapsedChange: (ids: Set<string>) => void,
  getCollapsedIds: () => Set<string>
): () => void {
  const handlers: Array<() => void> = [];

  const onMEOperation = (info: MEOperation) => {
    switch (info.name) {
      case 'moveNodeIn': {
        if ('objs' in info && 'toObj' in info) {
          for (const obj of info.objs) {
            onOperation({
              type: 'move',
              nodeId: obj.id,
              newParentId: info.toObj.id,
              index: -1,
            });
          }
        }
        break;
      }
      case 'moveNodeBefore':
      case 'moveNodeAfter': {
        if ('objs' in info && 'toObj' in info) {
          const toObj = info.toObj;
          const parentNode = toObj.parent;
          if (parentNode) {
            const toIndex = parentNode.children?.indexOf(toObj) ?? -1;
            for (let i = 0; i < info.objs.length; i++) {
              const idx = info.name === 'moveNodeAfter' ? toIndex + 1 + i : toIndex + i;
              onOperation({
                type: 'move',
                nodeId: info.objs[i].id,
                newParentId: parentNode.id,
                index: idx,
              });
            }
          }
        }
        break;
      }
      case 'finishEdit': {
        if ('obj' in info && 'origin' in info) {
          if (info.obj.topic !== info.origin) {
            onOperation({
              type: 'rename',
              nodeId: info.obj.id,
              newTitle: info.obj.topic,
            });
          }
        }
        break;
      }
      case 'addChild': {
        if ('obj' in info) {
          const obj = info.obj;
          const parentId = obj.parent?.id;
          if (parentId) {
            onOperation({
              type: 'create',
              parentId,
              index: -1,
              title: obj.topic || '新节点',
            });
          }
        }
        break;
      }
      case 'insertSibling': {
        if ('obj' in info) {
          const obj = info.obj;
          const parentId = obj.parent?.id;
          if (parentId) {
            onOperation({
              type: 'create',
              parentId,
              index: -1,
              title: obj.topic || '新节点',
            });
          }
        }
        break;
      }
      case 'removeNode': {
        if ('obj' in info) {
          onOperation({ type: 'delete', nodeId: info.obj.id });
        }
        break;
      }
      case 'removeNodes': {
        if ('objs' in info) {
          for (const obj of info.objs) {
            onOperation({ type: 'delete', nodeId: obj.id });
          }
        }
        break;
      }
    }
  };
  instance.bus.addListener('operation', onMEOperation);
  handlers.push(() => instance.bus.removeListener('operation', onMEOperation));

  const onExpand = (nodeObj: NodeObj) => {
    const newCollapsed = new Set(getCollapsedIds());
    newCollapsed.delete(nodeObj.id);
    onCollapsedChange(newCollapsed);
  };
  instance.bus.addListener('expandNode', onExpand);
  handlers.push(() => instance.bus.removeListener('expandNode', onExpand));

  return () => handlers.forEach(h => h());
}
