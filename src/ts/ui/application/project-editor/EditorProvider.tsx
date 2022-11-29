import {
  createSignal,
  createContext,
  useContext,
  Component,
  Accessor,
  ParentProps,
  createEffect,
  Setter,
} from "solid-js";
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
  levels: Accessor<ILevel[]>;
  loading: () => boolean;
  dirty: Accessor<boolean>;
  setDirty: Setter<boolean>;
  setProjectStore: SetStoreFunction<Partial<IProject>>;
}

interface Props extends ParentProps {
  projectId: string;
}

export const EditorProvider: Component<Props> = (props) => {
  const { updateProject, setDirty, dirty, getProject, setProjectStore, levels, publish, project, loading } = useProject(
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
    setProjectStore,
    dirty,
    setDirty,
    levels,
    project,
  };

  return <EditorContext.Provider value={context}>{props.children}</EditorContext.Provider>;
};

export function useEditor() {
  return useContext(EditorContext)!;
}
