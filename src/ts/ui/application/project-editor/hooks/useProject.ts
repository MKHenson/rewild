import { ILevel, IProject } from "models";
import { Timestamp } from "firebase/firestore";
import { getLevel as getLevelApi, patchLevel, patchProject, getProject as getProjectApi } from "../../../../../api";
import { createSignal } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";

export function useProject(projectId: string) {
  const [loading, setLoading] = createSignal(false);
  const [project, setProjectStore] = createStore<Partial<IProject>>({});
  const [error, setError] = createSignal("");
  const [level, setLevel] = createSignal<ILevel | null>(null);
  const [dirty, setDirty] = createSignal(false);

  const getProject = async () => {
    setLoading(true);

    try {
      const resp = await getProjectApi(projectId);
      setProjectStore({ ...resp, id: projectId });

      await getLevel(resp.id);
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
    setDirty(false);
  };

  const setProject = ((...args: any[]) => {
    setDirty(true);
    (setProjectStore as any)(...args);
  }) as SetStoreFunction<IProject>;

  const updateProject = async () => {
    const { id, ...token } = project;
    token.lastModified = Timestamp.now();
    setLoading(true);

    try {
      await patchProject(id!, token);
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
    setDirty(false);
  };

  const publish = async () => {
    await updateProject();
    setLoading(true);

    await patchLevel(project.level!, {
      lastModified: Timestamp.now(),
      containers: project.containers?.slice(0),
      activeOnStartup: project.activeOnStartup,
      startEvent: project.startEvent,
    });

    await getLevel(project.id!);
    setLoading(false);
    setDirty(false);
  };

  const getLevel = async (projectId: string) => {
    const level = await getLevelApi(projectId);
    setLevel(level);
  };

  return {
    dirty,
    error,
    project,
    setProject,
    loading,
    level,
    publish,
    updateProject,
    getProject,
  };
}
