import { createSignal, createContext, useContext, Component, Accessor, ParentProps, createEffect } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { ILevel, IProject, IResource } from "models";
import { useProject } from "./hooks/useProject";

const EditorContext = createContext<EditorContext>();

interface EditorContext {
  projectId: string;
  selectedResource: Accessor<IResource | null>;
  setResource: (resource: IResource | null) => void;
  save: () => void;
  publish: () => void;
  project: Partial<IProject>;
  level: Accessor<ILevel | null>;
  loading: () => boolean;
  dirty: Accessor<boolean>;
  setProject: SetStoreFunction<Partial<IProject>>;
}

interface Props extends ParentProps {
  projectId: string;
}

export const EditorProvider: Component<Props> = (props) => {
  const { updateProject, dirty, getProject, setProject, level, publish, project, loading } = useProject(
    props.projectId
  );
  const [selectedResource, setSelectedResource] = createSignal<IResource | null>(null);

  createEffect(() => {
    getProject();
  });

  const setResource = (resource: IResource | null) => {
    setSelectedResource(resource);
  };

  const save = () => {
    updateProject();
  };

  const context: EditorContext = {
    projectId: props.projectId,
    loading,
    save,
    publish,
    selectedResource,
    setResource,
    setProject,
    dirty,
    level,
    project,
  };

  return <EditorContext.Provider value={context}>{props.children}</EditorContext.Provider>;
};

export function useEditor() {
  return useContext(EditorContext)!;
}
