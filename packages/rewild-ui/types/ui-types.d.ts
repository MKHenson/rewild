import type { IconType } from "../lib/common/MaterialIcon";

export interface IDragDropAction {
  type: "cell-move" | "treenode";
}

export interface IGridCellAction extends IDragDropAction {
  editor: string;
  sizeX: number;
  sizeY: number;
}

export interface ITreeNodeAction<T = any> extends IDragDropAction {
  node: ITreeNode<T>;
}

export type ITreeNode<T = any> = {
  name?: string;
  icon?: IconType;
  iconSize?: "s" | "xs";
  canSelect?: boolean;
  canRename?: boolean;
  children?: ITreeNode<T>[] | null;
  resource?: T;
  onDragOver?: (data: IDragDropAction | null, node: ITreeNode<T>) => boolean;
  onDrop?: (data: IDragDropAction, node: ITreeNode<T>) => boolean;
  onDragStart?: (node: ITreeNode<T>) => IDragDropAction;
};
