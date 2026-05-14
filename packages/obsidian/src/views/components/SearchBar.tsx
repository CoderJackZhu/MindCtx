import { h } from 'preact';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  onClose: () => void;
  matchCount: number;
}

export function SearchBar({ value, onChange, onClose, matchCount }: SearchBarProps) {
  return (
    <div class="minddoc-search-bar">
      <input
        type="text"
        class="minddoc-search-input"
        placeholder="搜索节点..."
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        autoFocus
      />
      {value && (
        <span class="minddoc-search-count">{matchCount} 个匹配</span>
      )}
      <button class="minddoc-search-close" onClick={onClose} title="关闭搜索">×</button>
    </div>
  );
}
