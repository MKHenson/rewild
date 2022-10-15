import { Component, Resource, Show } from "solid-js";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Loading } from "../../../common/Loading";
import { IProject } from "models";

export const Properties: Component<{ project: Resource<IProject | undefined> }> = (props) => {
  return (
    <Card>
      <Typography variant="h3">Properties</Typography>
      <Show when={!props.project.loading} fallback={<Loading />}>
        <>
          <Typography variant="h2">{props.project()?.name}</Typography>
          <Typography variant="light">{props.project()?.description}</Typography>
        </>
      </Show>
    </Card>
  );
};
