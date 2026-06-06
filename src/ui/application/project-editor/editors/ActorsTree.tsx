import { Tree, Component, register, Card, Loading } from 'rewild-ui';
import { actorStore } from '../../../stores/ActorStore';

interface Props {}

@register('x-actors-tree')
export class ActorsTree extends Component<Props> {
  init() {
    this.on(actorStore.dispatcher);

    this.onMount = () => {
      if (!actorStore.nodes.length && !actorStore.loading)
        actorStore.loadTemplate();
    };

    return () => {
      return (
        <Card stretched>
          <div class="content">
            {actorStore.loading ? (
              <Loading />
            ) : (
              <Tree rootNodes={actorStore.nodes} />
            )}
          </div>
        </Card>
      );
    };
  }

  getStyle() {
    return StyleSceneGraph;
  }
}

const StyleSceneGraph = cssStylesheet(css`
  .content {
    height: 100%;
    width: 100%;
  }
`);
