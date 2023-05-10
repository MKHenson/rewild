import { theme, Component, register, Typography, Card } from "rewild-ui";
import { PropertyValue } from "./PropertyValue";
import { projectStore } from "../../../stores/ProjectStore";

interface Props {}

@register("x-properties")
export class Properties extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectStore, (prop) => {
      if (
        prop === "selectedResource" ||
        prop === "selectedResource.name" ||
        prop.includes("selectedResource.properties")
      )
        this.render();
    });

    return () => {
      const selectedResource = projectStoreProxy.selectedResource;

      return (
        <Card stretched>
          <Typography variant="h3">Properties</Typography>
          {selectedResource && (
            <div class="properties">
              {selectedResource.properties.map((prop) => (
                <PropertyValue
                  label={prop.name}
                  value={prop.value}
                  type={prop.type}
                  options={prop.options}
                  onChange={(val) => {
                    prop.value = val;
                    projectStoreProxy.dirty = true;
                  }}
                />
              ))}
              <PropertyValue label="ID" value={selectedResource?.id} type="string" readonly />
              <PropertyValue
                label="Name"
                value={selectedResource.name}
                type="string"
                onChange={(val) => {
                  selectedResource.name = val;
                  projectStoreProxy.dirty = true;
                }}
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
