import { createSignal } from "solid-js";

export interface IDragData {
  type: "gridcell" | "treenode";
}

const signal = createSignal<IDragData | null>(null);

export function getDraggedData<T extends IDragData>() {
  const [getData] = signal;
  return getData() as T;
}

export function setDragData(e: DragEvent, data: IDragData) {
  const serializedData = JSON.stringify(data);

  e.dataTransfer?.setData("text", serializedData);
  const [, setData] = signal;
  setData(data);
}

export function getDragData(e: DragEvent): IDragData | null {
  const dataJSON = e.dataTransfer?.getData("text");
  if (!dataJSON) return null;

  let data: IDragData | undefined;
  try {
    data = JSON.parse(dataJSON);
  } catch {}

  if (data) return data;
  return null;
}
