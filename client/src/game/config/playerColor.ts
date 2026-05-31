export function rgbIntToCssHex(rgb: number): string {
  return `#${(Math.floor(rgb) & 0xffffff).toString(16).padStart(6, '0')}`;
}
