import { h } from 'preact';

interface DragIndicatorProps {
  position: 'before' | 'after' | null;
}

export function DragIndicator({ position }: DragIndicatorProps) {
  if (!position) return null;
  return <div class={`minddoc-drop-line ${position}`} />;
}
