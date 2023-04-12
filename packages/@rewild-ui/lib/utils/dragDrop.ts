import { IDragDropAction } from "models";

export let curDragAction: IDragDropAction | null = null;

export function startDragDrop<T extends IDragDropAction>(e: DragEvent, data: T) {
  curDragAction = data;
  e.dataTransfer?.setData("text", JSON.stringify(data));
  e.dataTransfer?.setDragImage((e.currentTarget as HTMLDivElement).parentElement!, 0, 0);
}

export function compelteDragDrop<T extends IDragDropAction>(e: DragEvent) {
  curDragAction = null;
  const data = e.dataTransfer?.getData("text");
  if (!data) return;
  const json = JSON.parse(data) as T;

  return json;
}
