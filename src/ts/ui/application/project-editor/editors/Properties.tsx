import { IContainer } from "models";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { PropertyValue } from "./PropertyValue";
import { Component, register } from "../../../Component";
import { projectStore } from "../../../stores/Project";
import { theme } from "../../../theme";

interface Props {}

interface StringEditFunction<T, K extends keyof T> {
  (value: T[K], key: K): void;
}

function setProperty<T, K extends keyof T>(obj: T, key: K, value: T[K]) {
  obj[key] = value;
}

@register("x-properties")
export class Properties extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectStore, (prop, prevValue, value, path) => {
      this.render();
    });

    const onContainerEdited: StringEditFunction<IContainer, keyof IContainer> = (val, type) => {
      const selectedResource = projectStoreProxy.selectedResource;

      if (selectedResource?.type === "container") {
        const container: IContainer = projectStoreProxy.project?.containers.find((c) => c.id === selectedResource.id)!;
        setProperty(container, type, val);
      }

      projectStoreProxy.dirty = true;
    };

    return () => {
      const selectedResource = projectStoreProxy.selectedResource;

      return (
        <Card stretched>
          <Typography variant="h3">Properties</Typography>
          {selectedResource && (
            <div class="properties">
              <PropertyValue label="ID" value={selectedResource?.id} type="string" readonly />
              <PropertyValue
                label="Name"
                value={(selectedResource as IContainer).name}
                type="string"
                onChange={(val) => onContainerEdited(val, "name")}
              />
              <PropertyValue
                label="Base Container"
                value={(selectedResource as IContainer).baseContainer}
                type="string"
                onChange={(val) => onContainerEdited(val, "baseContainer")}
              />
              <PropertyValue<boolean>
                label="Active On Startup"
                value={(selectedResource as IContainer).activeOnStartup}
                type="boolean"
                onChange={(val) => onContainerEdited(val, "activeOnStartup")}
              />
            </div>
          )}
        </Card>
      );
    };
  }

  getStyle() {
    return StyledPropGrid;
  }
}

const StyledPropGrid = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
    width: 100%;
  }

  .properties {
    border-top: 1px solid ${theme.colors.onSurfaceLight};
  }
`);
