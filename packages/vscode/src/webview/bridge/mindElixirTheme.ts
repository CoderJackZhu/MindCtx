import type { ThemeColors } from '../../types/messages.js';

export function getVSCodeTheme(colors: ThemeColors): Record<string, string> {
  return {
    '--main-color': colors.foreground,
    '--main-bgcolor': colors.background,
    '--color': colors.foreground,
    '--bgcolor': colors.nodeBackground,
    '--selected': colors.accent,
    '--root-color': '#ffffff',
    '--root-bgcolor': colors.accent,
  };
}

export function applyTheme(container: HTMLElement, theme: Record<string, string>): void {
  for (const [key, value] of Object.entries(theme)) {
    container.style.setProperty(key, value);
  }
}
