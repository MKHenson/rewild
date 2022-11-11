import { IContainer } from "models";
import { createUUID } from "../../../utils";

export function createContainer() {
  const newContainer = {
    id: createUUID(),
    name: `New Container`,
    activeOnStartup: true,
    type: "container",
  } as IContainer;

  return newContainer;
}
