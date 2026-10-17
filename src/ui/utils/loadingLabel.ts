/** Loading caption for a file the renderer has started downloading. */
export function loadingLabel(url: string): string {
  const name = url.split(/[?#]/)[0].split('/').pop();
  return `Loading ${name || url}`;
}
