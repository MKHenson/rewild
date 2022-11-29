import { ILevel, IProject } from "models";
import {
  getDocs,
  addDoc,
  updateDoc,
  getDoc,
  doc,
  where,
  Timestamp,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  QueryConstraint,
} from "firebase/firestore";
import { dbs } from "../../../../../firebase";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

export function useProject(projectId: string) {
  const [loading, setLoading] = createSignal(false);
  const [project, setProjectStore] = createStore<Partial<IProject>>({});
  const [error, setError] = createSignal("");
  const [levels, setLevels] = createSignal<ILevel[]>([]);
  const [dirty, setDirty] = createSignal(false);

  const getProject = async () => {
    setLoading(true);

    try {
      const docRef = await doc(dbs.projects, projectId);
      const projectDoc = await getDoc(docRef);
      setProjectStore({ ...projectDoc.data()!, id: projectId });

      await getLevels(projectDoc.id);
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
    setDirty(false);
  };

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

    const { id, ...token } = project;
    if (!id) throw new Error(`Project ID is required`);

    const level: ILevel = {
      project: id,
      containers: token.containers!.slice(),
      created: Timestamp.now(),
    };
    await addDoc(dbs.levels, level);
    await getLevels(id);
    setLoading(false);
    setDirty(false);
  };

  const getLevels = async (projectId: string, page?: QueryDocumentSnapshot<ILevel>) => {
    const resp = await query<ILevel>(
      dbs.levels,
      ...([
        where("project", "==", projectId),
        orderBy("created", "desc"),
        limit(30),
        page ? startAfter(page) : undefined,
      ].filter((q) => !!q) as QueryConstraint[])
    );
    const toRet = await getDocs(resp);
    const levels = toRet.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    setLevels(levels);
  };

  return {
    dirty,
    error,
    setDirty,
    project,
    setProjectStore,
    loading,
    levels,
    getLevels,
    publish,
    updateProject,
    getProject,
  };
}
