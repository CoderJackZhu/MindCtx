import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

interface InlineEditorProps {
  value: string;
  onConfirm: (newValue: string) => void;
  onCancel: () => void;
}

export function InlineEditor({ value, onConfirm, onCancel }: InlineEditorProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      class="minddoc-inline-editor"
      value={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm((e.target as HTMLInputElement).value);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={(e) => onConfirm((e.target as HTMLInputElement).value)}
    />
  );
}
