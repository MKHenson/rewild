import { ILevel, IProject } from "models";
import {
  getDocs,
  addDoc,
  deleteDoc,
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
import { httpsCallable } from "firebase/functions";
import { dbs, functions } from "../../../../../firebase";
import { createSignal } from "solid-js";

const helloworld = httpsCallable(functions, "helloworld");

export function useProjects() {
  const [loading, setLoading] = createSignal(false);
  const [projects, setProjects] = createSignal<IProject[]>([]);
  const [error, setError] = createSignal("");

  const getProjects = async (page?: QueryDocumentSnapshot<ILevel>) => {
    setLoading(true);

    const resp = await query<IProject>(
      dbs.projects,
      ...([orderBy("created", "desc"), limit(30), page ? startAfter(page) : undefined].filter(
        (q) => !!q
      ) as QueryConstraint[])
    );
    const toRet = await getDocs(resp);
    const projects = toRet.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

    setProjects(projects);
    setLoading(false);
  };

  const getProject = async (id: string) => {
    const docRef = await doc(dbs.projects, id);
    const projectDoc = await getDoc(docRef);
    return { ...projectDoc.data()!, id: projectDoc.id };
  };

  const addProject = async (token: Partial<IProject>) => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      token.created = Timestamp.now();
      token.lastModified = Timestamp.now();
      await addDoc(dbs.projects, token);
      await getProjects();
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
  };

  const removeProjects = async (id: string) => {
    setLoading(true);
    setError("");

    try {
      const docRef = await doc(dbs.projects, id);
      await deleteDoc(docRef);
      await getProjects();
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
  };

  const updateProject = async (project: IProject) => {
    const { id, ...token } = project;
    token.lastModified = Timestamp.now();

    const docRef = await doc(dbs.projects, id);
    await updateDoc(docRef, token);
  };

  // This is just a reference for the future
  const functionsTest = async () => {
    const functionResult = await helloworld({ foo: "bar" });
    return functionResult.data;
  };

  const publishLevel = async (project: IProject) => {
    const { id, ...token } = project;
    if (!id) throw new Error(`Project ID is required`);

    const level: ILevel = {
      project: id,
      containers: token.containers.slice(),
      created: Timestamp.now(),
    };
    const docRef = await addDoc(dbs.levels, level);
    return docRef.id;
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
    return toRet.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  };

  return {
    error,
    loading,
    projects,
    getLevels,
    publishLevel,
    functionsTest,
    updateProject,
    removeProjects,
    addProject,
    getProject,
    getProjects,
  };
}
