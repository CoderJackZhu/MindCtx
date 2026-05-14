import { h } from 'preact';

interface ViewSwitcherProps {
  currentView: 'outline' | 'mindmap';
  onSwitch: (view: 'outline' | 'mindmap') => void;
}

export function ViewSwitcher({ currentView, onSwitch }: ViewSwitcherProps) {
  return (
    <div class="mindctx-view-switcher">
      <button
        class={`mindctx-switch-btn ${currentView === 'outline' ? 'is-active' : ''}`}
        onClick={() => onSwitch('outline')}
        title="Outline view"
      >
        Outline
      </button>
      <button
        class={`mindctx-switch-btn ${currentView === 'mindmap' ? 'is-active' : ''}`}
        onClick={() => onSwitch('mindmap')}
        title="Mind map view"
      >
        Mind Map
      </button>
    </div>
  );
}
