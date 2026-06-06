import { Component, register, Typography, Card } from 'rewild-ui';
import { PropertyValue } from './PropertyValue';
import { projectStore } from '../../../stores/ProjectStore';
import { propertyTemplates } from './utils/PropertyTemplates';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';

interface Props {}
let lastFocussedProp = -1;

@register('x-properties')
export class Properties extends Component<Props> {
  init() {
    this.on(sceneGraphStore.dispatcher, (event) => {
      if (event.kind === 'resource-selected' || event.kind === 'nodes-updated')
        this.render();
    });
    lastFocussedProp = -1;

    return () => {
      const selectedResource = sceneGraphStore.selectedResource;

      return (
        <Card stretched>
          {selectedResource && (
            <div class="properties">
              {selectedResource.properties
                ?.filter((p) => !propertyTemplates[p.type].hidden)
                .map((prop, index) => {
                  const template = propertyTemplates[prop.type];
                  return [
                    <Typography variant="label">{template.label}</Typography>,
                    <div class="value">
                      <PropertyValue
                        value={prop.value}
                        customEditor={template.customEditor}
                        type={template.valueType}
                        options={template.options}
                        valueOptions={template.valueOptions}
                        refocus={lastFocussedProp === index}
                        onChange={(val) => {
                          lastFocussedProp = index;
                          prop.value = val;
                          projectStore.dirty = true;
                          projectStore.dispatcher.dispatch({
                            kind: 'changed',
                          });
                          sceneGraphStore.dispatcher.dispatch({
                            kind: 'nodes-updated',
                            nodes: sceneGraphStore.nodes,
                          });
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
                    projectStore.dirty = true;
                    projectStore.dispatcher.dispatch({ kind: 'changed' });
                    sceneGraphStore.dispatcher.dispatch({
                      kind: 'nodes-updated',
                      nodes: sceneGraphStore.nodes,
                    });
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
