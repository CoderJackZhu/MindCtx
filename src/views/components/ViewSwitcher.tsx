import { h } from 'preact';

interface ViewSwitcherProps {
  currentView: 'outline' | 'mindmap';
  onSwitch: (view: 'outline' | 'mindmap') => void;
}

export function ViewSwitcher({ currentView, onSwitch }: ViewSwitcherProps) {
  return (
    <div class="minddoc-view-switcher">
      <button
        class={`minddoc-switch-btn ${currentView === 'outline' ? 'is-active' : ''}`}
        onClick={() => onSwitch('outline')}
        title="大纲视图"
      >
        大纲
      </button>
      <button
        class={`minddoc-switch-btn ${currentView === 'mindmap' ? 'is-active' : ''}`}
        onClick={() => onSwitch('mindmap')}
        title="思维导图"
      >
        脑图
      </button>
    </div>
  );
}
