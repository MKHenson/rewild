import { Card } from "@rewild/ui/lib/common/Card";
import { Typography } from "@rewild/ui/lib/common/Typography";
import { Component, register } from "@rewild/ui/lib/Component";
import { Tree } from "@rewild/ui/lib/common/Tree";
import { actorStore } from "../../../stores/ActorStore";

interface Props {}

@register("x-actors-tree")
export class ActorsTree extends Component<Props> {
  init() {
    const actorStoreProxy = this.observeStore(actorStore);

    return () => {
      return (
        <Card stretched>
          <div class="content">
            <div class="header">
              <Typography variant="h3">Actors</Typography>
            </div>
            <div class="nodes">
              <Tree rootNodes={actorStoreProxy.nodes} />
            </div>
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
    display: grid;
    height: 100%;
    width: 100%;
    grid-template-rows: 20px 1fr 30px;
  }

  .nodes {
    max-height: 100%;
    overflow: hidden;
  }
`);
