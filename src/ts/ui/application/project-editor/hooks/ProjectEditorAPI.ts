import { IProject } from "models";
import { getDocs, addDoc, deleteDoc, updateDoc, getDoc, doc } from "firebase/firestore";
import { dbs } from "../../../../../firebase";
import { defaultWorkspace } from "./ProjectEditorUtils";

export async function getProjects() {
  const querySnapshot = await getDocs(dbs.projects);
  const toRet = querySnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  return toRet;
}

export async function getProject(id: string) {
  const docRef = await doc(dbs.projects, id);
  const projectDoc = await getDoc(docRef);
  return { ...projectDoc.data()!, id: projectDoc.id };
}

export async function addProject(token: Partial<IProject>) {
  if (!token) return;

  token.workspace = defaultWorkspace();
  token.containers = [];

  const docRef = await addDoc(dbs.projects, token);
  return docRef.id;
}

export async function removeProjects(id: string) {
  const docRef = await doc(dbs.projects, id);
  await deleteDoc(docRef);
}

export async function updateProject(project: IProject) {
  const { id, ...token } = project;
  const docRef = await doc(dbs.projects, id);
  await updateDoc(docRef, token);
}
