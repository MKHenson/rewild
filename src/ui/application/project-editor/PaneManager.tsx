import { RibbonButtons } from './editors/RibbonButtons';
import { EditorType } from 'models';
import { Loading, Component, register, InfoBox, SplitPane } from 'rewild-ui';
import { SceneGraph } from './editors/SceneGraph';
import { ProjectSettings } from './editors/ProjectSettings';
import { projectStore } from '../../stores/ProjectStore';
import { Properties } from './editors/Properties';
import { ActorsTree } from './editors/ActorsTree';
import { EditorViewport } from './editors/EditorViewport';

interface Props {
  onHome: () => void;
}

@register('x-pane-manager')
export class PaneManager extends Component<Props> {
  viewport: EditorViewport;

  init() {
    const projectStoreProxy = this.observeStore(
      projectStore,
      (prop, prevVal, val) => {
        if (prop === 'loading') {
          this.render();
        }
      }
    );

    // Now create each of the editors
    const editors: { [key in EditorType]: HTMLElement } = {
      properties: <Properties />,
      'scene-graph': <SceneGraph />,
      viewport: <EditorViewport />,
      'project-settings': <ProjectSettings />,
      ribbon: <RibbonButtons onHome={this.props.onHome} />,
      actors: <ActorsTree />,
    };

    this.viewport = editors.viewport as EditorViewport;

    const layout = (
      <SplitPane
        initalRatio="42px"
        mode="horizontal"
        pane1={editors.ribbon}
        pane2={
          <SplitPane
            mode="vertical"
            initalRatio="70%"
            pane1={
              <SplitPane
                mode="vertical"
                initalRatio="250px"
                pane1={
                  <SplitPane
                    mode="horizontal"
                    pane1={editors['project-settings']}
                    pane2={editors.actors}
                    pane1Title="Project Settings"
                    pane2Title="Actors"
                  />
                }
                pane2={editors.viewport}
              />
            }
            pane2={
              <SplitPane
                mode="horizontal"
                pane1={editors.properties}
                pane2={editors['scene-graph']}
                pane1Title="Properties"
                pane2Title="Scene Graph"
              />
            }
          />
        }
      />
    );

    return () => {
      if (projectStoreProxy.error)
        return (
          <InfoBox title="Error" variant="error">
            {projectStoreProxy.error}
          </InfoBox>
        );

      if (projectStoreProxy.loading) return <Loading />;

      return layout;
    };
  }

  dispose() {
    this.viewport.dispose();
  }

  getStyle() {
    return StyledEditorGrid;
  }
}

const StyledEditorGrid = cssStylesheet(css`
  :host {
    height: 100%;
    width: 100%;
    display: blck;
  }
`);
