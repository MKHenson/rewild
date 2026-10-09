import { Component, register, Typography, Card, theme } from 'rewild-ui';
import { PropertyValue } from './PropertyValue';
import { projectStore } from '../../../stores/ProjectStore';
import { propertyTemplates } from './utils/PropertyTemplates';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';

interface Props {}
/** The property, or `'name'`, to refocus after an edit re-renders the grid. */
let lastFocussedProp: string | null = null;

@register('x-properties')
export class Properties extends Component<Props> {
  init() {
    this.on(sceneGraphStore.dispatcher, (event) => {
      if (event.kind === 'resource-selected' || event.kind === 'nodes-updated')
        this.render();
    });
    lastFocussedProp = null;

    return () => {
      const selectedResource = sceneGraphStore.selectedResource;

      return (
        <Card stretched>
          {selectedResource && (
            <div class="properties">
              {selectedResource.properties
                ?.filter((p) => {
                  const template = propertyTemplates[p.type];
                  if (template.hidden) return false;
                  const rule = template.shownWhen;
                  if (!rule) return true;
                  const sibling = selectedResource.properties?.find(
                    (other) => other.type === rule.property
                  );
                  return !!sibling?.value === rule.is;
                })
                .map((prop) => {
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
                        refocus={lastFocussedProp === prop.type}
                        onChange={(val) => {
                          lastFocussedProp = prop.type;
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
                  ];
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
                  refocus={lastFocussedProp === 'name'}
                  onChange={(val) => {
                    lastFocussedProp = 'name';
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
    grid-template-columns: max-content 2fr;
    column-gap: ${theme.space.l};
    align-items: center;
  }
`);
