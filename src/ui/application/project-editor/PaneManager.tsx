import { RibbonButtons } from './editors/RibbonButtons';
import { EditorType } from 'models';
import {
  Loading,
  Component,
  register,
  InfoBox,
  SplitPane,
  PaneTabs,
} from 'rewild-ui';
import { SceneGraph } from './editors/SceneGraph';
import { projectStore } from '../../stores/ProjectStore';
import { Properties } from './editors/Properties';
import { ActorsTree } from './editors/ActorsTree';
import { LevelsTree } from './editors/LevelsTree';
import { EditorViewport } from './editors/EditorViewport';

interface Props {
  onHome: () => void;
}

@register('x-pane-manager')
export class PaneManager extends Component<Props> {
  viewport: EditorViewport;

  init() {
    let projectLoaded = false;

    this.on(projectStore.dispatcher, (event) => {
      if (event.kind === 'loading-completed') projectLoaded = true;
      if (event.kind === 'changed' || event.kind === 'loading-completed')
        this.render();
    });

    // Now create each of the editors
    const editors: { [key in EditorType]: HTMLElement } = {
      properties: <Properties />,
      'scene-graph': <SceneGraph />,
      viewport: <EditorViewport />,
      ribbon: <RibbonButtons onHome={this.props.onHome} />,
      actors: <ActorsTree />,
      levels: <LevelsTree />,
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
            initalRatio="80%"
            pane1={
              <SplitPane
                mode="vertical"
                initalRatio="250px"
                pane1={
                  <PaneTabs
                    tabs={[
                      { title: 'Actors', content: editors.actors },
                      { title: 'Levels', content: editors.levels },
                    ]}
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

    // Kept after the layout so showing or hiding it never moves the layout,
    // which would re-mount the viewport.
    const savingOverlay = <Loading overlay />;

    return () => {
      if (projectStore.error)
        return (
          <InfoBox title="Error" variant="error">
            {projectStore.error}
          </InfoBox>
        );

      if (!projectLoaded) return <Loading />;

      return projectStore.loading ? [layout, savingOverlay] : [layout];
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
    display: block;
    position: relative;
  }
`);
