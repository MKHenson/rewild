import { theme, Component, register, Typography, Card } from 'rewild-ui';
import { PropertyValue } from './PropertyValue';
import { projectStore } from '../../../stores/ProjectStore';

interface Props {}
let lastFocussedProp = -1;

@register('x-properties')
export class Properties extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectStore, (prop) => {
      if (
        prop === 'selectedResource' ||
        prop === 'selectedResource.name' ||
        prop.includes('selectedResource.properties')
      )
        this.render();
    });
    lastFocussedProp = -1;

    return () => {
      const selectedResource = projectStoreProxy.selectedResource;

      return (
        <Card stretched>
          <Typography variant="h3">Properties</Typography>
          {selectedResource && (
            <div class="properties">
              {selectedResource.properties
                .filter((p) => p.valueType !== 'hidden')
                .map((prop, index) => {
                  return [
                    <Typography variant="label">{prop.label}</Typography>,
                    <div class="value">
                      <PropertyValue
                        value={prop.value}
                        type={prop.valueType}
                        options={prop.options}
                        valueOptions={prop.valueOptions}
                        refocus={lastFocussedProp === index}
                        onChange={(val) => {
                          lastFocussedProp = index;
                          prop.value = val;
                          projectStoreProxy.dirty = true;
                        }}
                      />
                    </div>,
                  ].flat();
                })}
              <Typography variant="label">ID</Typography>
              <div class="value">
                <PropertyValue
                  value={selectedResource?.id}
                  type="string"
                  readonly
                  refocus={false}
                />
              </div>
              <Typography variant="label">Name</Typography>
              <div class="value">
                <PropertyValue
                  value={selectedResource.name}
                  type="string"
                  refocus={lastFocussedProp === -2}
                  onChange={(val) => {
                    lastFocussedProp = -2;
                    selectedResource.name = val;
                    projectStoreProxy.dirty = true;
                  }}
                />
              </div>
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
    display: grid;
    grid-template-columns: 1fr 2fr;
    align-items: center;
  }
`);
