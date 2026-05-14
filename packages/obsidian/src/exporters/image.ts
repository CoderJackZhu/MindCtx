export async function exportPNG(container: HTMLElement): Promise<Blob> {
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(container, {
    backgroundColor: getComputedStyle(container).backgroundColor,
    pixelRatio: 2,
  });
  if (!blob) throw new Error('PNG 导出失败');
  return blob;
}

export async function exportSVG(container: HTMLElement): Promise<string> {
  const { toSvg } = await import('html-to-image');
  return toSvg(container);
}
