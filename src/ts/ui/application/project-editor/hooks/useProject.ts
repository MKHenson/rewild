import { ILevel, IProject } from "models";
import { getDocs, updateDoc, getDoc, doc, where, Timestamp, query } from "firebase/firestore";
import { dbs } from "../../../../../firebase";
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
      const docRef = await doc(dbs.projects, projectId);
      const projectDoc = await getDoc(docRef);
      setProjectStore({ ...projectDoc.data()!, id: projectId });

      await getLevel(projectDoc.id);
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
      const docRef = await doc(dbs.projects, id);
      await updateDoc(docRef, token);
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
    setDirty(false);
  };

  const publish = async () => {
    await updateProject();
    setLoading(true);

    const levelRef = doc(dbs.levels, project.level);
    await updateDoc(levelRef, { lastModified: Timestamp.now(), containers: project.containers?.slice(0) });
    await getLevel(project.id!);
    setLoading(false);
    setDirty(false);
  };

  const getLevel = async (projectId: string) => {
    const resp = await query<ILevel>(dbs.levels, where("project", "==", projectId));
    const toRet = await getDocs(resp);
    const levels = toRet.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    setLevel(levels.at(0)!);
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
