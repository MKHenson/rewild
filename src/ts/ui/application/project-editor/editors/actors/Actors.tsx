import { Component, createEffect, createSignal, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { IResource, ITreeNode } from "models";
import { Card } from "../../../../common/Card";
import { Typography } from "../../../../common/Typography";
import { Loading } from "../../../../common/Loading";
import { Tree } from "../../../../common/Tree";
import { useEditor } from "../../EditorProvider";
import { ActorFactory } from "./ActorFactory";

const actorFactory = new ActorFactory();
interface Props {}

export const Actors: Component<Props> = (props) => {
  const [selectedNodes, setSelectedNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const [nodes, setNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const { project } = useEditor();

  createEffect(() => {
    if (project) {
      const newNodes = actorFactory.buildTree();
      setNodes(newNodes);
    }
  });

  const setSelection = (val: ITreeNode<IResource>[]) => {
    setSelectedNodes(val);
  };

  const onSelectionChanged = (val: ITreeNode[]) => {
    setSelection(val);
  };

  return (
    <Card>
      <StyleActorsContainer>
        <div class="header">
          <Typography variant="h3">Actors</Typography>
        </div>
        <div class="nodes">
          <Show when={project} fallback={<Loading />}>
            <Tree onSelectionChanged={onSelectionChanged} selectedNodes={selectedNodes()} rootNodes={nodes()} />
          </Show>
        </div>
      </StyleActorsContainer>
    </Card>
  );
};

const StyleActorsContainer = styled.div`
  display: grid;
  height: 100%;
  width: 100%;
  grid-template-rows: 20px 1fr 30px;

  .graph-actions button {
    color: ${(e) => e.theme?.colors.onSubtle};
    padding: 0.5rem;
  }

  .nodes {
    max-height: 100%;
    overflow: hidden;
  }

  .selected-treenode .treenode-text.editting {
    border: 1px dashed grey;
    outline: none;
    padding: 2px 4px;
  }
`;
