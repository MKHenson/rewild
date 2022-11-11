import {
  createSignal,
  createResource,
  Resource,
  createContext,
  useContext,
  Component,
  Accessor,
  ParentProps,
  createEffect,
  Setter,
} from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { IProject, IResource } from "models";
import { getProject, updateProject } from "./hooks/ProjectEditorAPI";

const EditorContext = createContext<EditorContext>();

interface EditorContext {
  selectedResource: Accessor<IResource | null>;
  setResource: (resource: IResource | null) => void;
  save: () => void;
  projectResource: Resource<IProject>;
  project: Partial<IProject>;
  loading: () => boolean;
  projectDirty: Accessor<boolean>;
  setProjectDirty: Setter<boolean>;
  setProjectStore: SetStoreFunction<Partial<IProject>>;
}

interface Props extends ParentProps {
  projectId: string;
}

export const EditorProvider: Component<Props> = (props) => {
  const [selectedResource, setSelectedResource] = createSignal<IResource | null>(null);
  const [projectResource] = createResource(props.projectId, getProject);
  const [project, setProjectStore] = createStore<Partial<IProject>>({});
  const [projectDirty, setProjectDirty] = createSignal(false);
  const [mutating, setMutating] = createSignal(false);

  createEffect(() => {
    const newProj = projectResource();
    if (newProj) {
      setProjectStore(newProj);
      setProjectDirty(false);
    }
  });

  const setResource = (resource: IResource | null) => {
    setSelectedResource(resource);
  };

  const loading = () => {
    return projectResource.loading || mutating();
  };

  const save = async () => {
    setMutating(true);
    await updateProject(project as IProject);
    setProjectDirty(false);
    setMutating(false);
  };

  const counter: EditorContext = {
    projectResource,
    loading,
    save,
    selectedResource,
    setResource,
    setProjectStore,
    projectDirty,
    setProjectDirty,
    project,
  };

  return <EditorContext.Provider value={counter}>{props.children}</EditorContext.Provider>;
};

export function useEditor() {
  return useContext(EditorContext)!;
}
