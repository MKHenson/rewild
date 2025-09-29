import { Tree, Component, register, Card, Loading } from 'rewild-ui';
import { actorStore } from '../../../stores/ActorStore';

interface Props {}

@register('x-actors-tree')
export class ActorsTree extends Component<Props> {
  init() {
    const actorStoreProxy = this.observeStore(actorStore);

    this.onMount = () => {
      if (!actorStore.nodes.length && !actorStoreProxy.loading)
        actorStore.loadTemplate();
    };

    return () => {
      return (
        <Card stretched>
          <div class="content">
            {actorStoreProxy.loading ? (
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
