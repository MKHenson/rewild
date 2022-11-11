import { Component } from "solid-js";
import { useParams } from "@solidjs/router";
import { EditorGrid } from "./EditorGrid";
import { EditorProvider } from "./EditorProvider";

interface Props {
  onHome: () => void;
}

export const Editor: Component<Props> = (props) => {
  const { project: projectId } = useParams<{ project: string }>();

  return (
    <EditorProvider projectId={projectId}>
      <EditorGrid onHome={props.onHome} />
    </EditorProvider>
  );
};
