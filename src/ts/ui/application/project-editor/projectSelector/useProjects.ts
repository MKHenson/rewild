import { ILevel, IProject } from "models";
import {
  getLevels,
  addLevel,
  addProject as addProjectApi,
  getProject,
  deleteLevel,
  deleteProject,
  getProjects as getProjectsApi,
  patchProject,
} from "../../../../../api";
import { Timestamp, QueryDocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../../../firebase";
import { createSignal } from "solid-js";

const helloworld = httpsCallable(functions, "helloworld");

export function useProjects() {
  const [loading, setLoading] = createSignal(false);
  const [projects, setProjects] = createSignal<IProject[]>([]);
  const [error, setError] = createSignal("");

  const getProjects = async (page?: QueryDocumentSnapshot<IProject>) => {
    setLoading(true);
    const projects = await getProjectsApi(false, page);
    setProjects(projects);
    setLoading(false);
  };

  const addProject = async (token: Partial<IProject>) => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      token.created = Timestamp.now();
      token.lastModified = Timestamp.now();
      const resp = await addProjectApi(token);

      const newLevel: ILevel = {
        containers: [],
        startEvent: token.startEvent || "",
        created: Timestamp.now(),
        lastModified: Timestamp.now(),
        project: resp.id,
        activeOnStartup: token.activeOnStartup || true,
      };
      const levelResp = await addLevel(newLevel);
      patchProject(resp, { level: levelResp.id });

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
      const project = await getProject(id);
      await deleteProject(id);
      await deleteLevel(project.level);
      await getProjects();
    } catch (err: any) {
      setError(err.toString());
    }

    setLoading(false);
  };

  const updateProject = async (project: IProject) => {
    const { id, ...token } = project;
    token.lastModified = Timestamp.now();
    await patchProject(id!, token);
  };

  // This is just a reference for the future
  const functionsTest = async () => {
    const functionResult = await helloworld({ foo: "bar" });
    return functionResult.data;
  };

  return {
    error,
    loading,
    projects,
    getLevels,
    functionsTest,
    updateProject,
    removeProjects,
    addProject,
    getProject,
    getProjects,
  };
}
