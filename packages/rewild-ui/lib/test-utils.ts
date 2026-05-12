/** Flushes all pending microtasks and queued renders — use after setState calls to await deferred renders. */
export const flushMicrotasks = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Clicks an element and flushes pending renders. */
export async function fireClick(element: Element): Promise<void> {
  (element as HTMLElement).click();
  await flushMicrotasks();
}

/** Dispatches an event on an element and flushes pending renders. */
export async function fireEvent(element: Element, event: Event): Promise<void> {
  element.dispatchEvent(event);
  await flushMicrotasks();
}
