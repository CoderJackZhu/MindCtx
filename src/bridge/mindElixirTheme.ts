export function getObsidianTheme(containerEl: HTMLElement): Record<string, string> {
  const style = getComputedStyle(containerEl);

  return {
    '--main-color': style.getPropertyValue('--text-normal').trim(),
    '--main-bgcolor': style.getPropertyValue('--background-primary').trim(),
    '--color': style.getPropertyValue('--text-normal').trim(),
    '--bgcolor': style.getPropertyValue('--background-secondary').trim(),
    '--selected': style.getPropertyValue('--interactive-accent').trim(),
    '--root-color': style.getPropertyValue('--text-on-accent').trim(),
    '--root-bgcolor': style.getPropertyValue('--interactive-accent').trim(),
  };
}

export function applyTheme(container: HTMLElement, theme: Record<string, string>) {
  for (const [key, value] of Object.entries(theme)) {
    container.style.setProperty(key, value);
  }
}
