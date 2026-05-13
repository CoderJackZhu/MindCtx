import type { MindDocTree, MindDocNode, PartialOperation } from '../core/types.js';
import type { NodeObj, MindElixirData, MindElixirInstance, Operation as MEOperation } from 'mind-elixir';

type MindElixirTopicElement = HTMLElement & { nodeObj?: NodeObj };

export function treeToMindElixirData(tree: MindDocTree, collapsedIds: Set<string>): MindElixirData {
  function convert(node: MindDocNode, isTopLevel: boolean, index: number): NodeObj {
    const data: NodeObj = {
      id: node.id,
      topic: node.title || '(空节点)',
      expanded: !collapsedIds.has(node.id),
      tags: node.tags.length > 0 ? node.tags : undefined,
      note: node.note || undefined,
    };

    if (isTopLevel) {
      data.direction = index % 2 === 0 ? 0 : 1;
    }

    if (node.children.length > 0) {
      data.children = node.children.map((child, i) => convert(child, false, i));
    }

    return data;
  }

  const rootData: NodeObj = {
    id: tree.root.id,
    topic: tree.root.title || tree.filePath.replace(/.*\//, '').replace(/\.mind\.md$/, '').replace(/\.md$/, ''),
    expanded: true,
    children: tree.root.children.map((child, i) => convert(child, true, i)),
  };

  return { nodeData: rootData };
}

export function syncMindElixirAddChildButtons(
  instance: MindElixirInstance,
  onAddChild: (parentId: string) => void
): void {
  const topics = instance.container.querySelectorAll<MindElixirTopicElement>('me-tpc');

  topics.forEach(topic => {
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
      const parentId = topic.nodeObj?.id;
      if (parentId) onAddChild(parentId);
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
