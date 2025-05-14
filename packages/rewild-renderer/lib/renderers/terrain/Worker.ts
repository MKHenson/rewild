export function createWorkerFromFunction(fn: Function) {
  const bytes = new TextEncoder().encode(`self.onmessage= ${fn.toString()}`);
  const blob = new Blob([bytes], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: 'module' });
  return worker;
}
