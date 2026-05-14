export function fnv1a64(str: string): string {
  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_64 = (1n << 64n) - 1n;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(36);
}

export function generateNodeId(titlePath: string[], siblingIndex: number): string {
  const pathStr = titlePath.join('/') + ':' + siblingIndex;
  return fnv1a64(pathStr);
}
