export * from "./core";
import { Container } from "./core";
import { EditorContainer, Level1, MainMenu, TestLevel } from "./custom";
import { ContainerTypes } from "../../../common/ContainerType";

export function createContainer(name: string, base: string): Container {
  if (base === ContainerTypes.Editor) return new EditorContainer(name);
  if (base === ContainerTypes.Level1) return new Level1(name);
  if (base === ContainerTypes.MainMenu) return new MainMenu(name);
  if (base === ContainerTypes.TestLevel) return new TestLevel(name);

  return new Container(name);
}
