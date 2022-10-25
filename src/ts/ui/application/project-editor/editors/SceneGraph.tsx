import { Component, Resource, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Loading } from "../../../common/Loading";
import { Tree } from "../../../common/Tree";
import { IProject } from "models";

export const SceneGraph: Component<{ project: Resource<IProject | undefined> }> = (props) => {
  return (
    <Card>
      <Typography variant="h3">Scene</Typography>
      <Show when={!props.project.loading} fallback={<Loading />}>
        <Tree rootNodes={[]} />
      </Show>
    </Card>
  );
};
