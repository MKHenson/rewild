import {
  addDoc,
  deleteDoc,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { dbs } from "../firebase";
import { IProject } from "models";

export async function getProjects(onlyStartup: boolean, page?: QueryDocumentSnapshot<IProject>) {
  const resp = await query<IProject>(
    dbs.projects,
    ...([
      onlyStartup && where("activeOnStartup", "==", true),
      page && startAfter(page),
      orderBy("created", "desc"),
      limit(30),
    ].filter((q) => !!q) as QueryConstraint[])
  );
  const toRet = await getDocs(resp);
  const projects = toRet.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  return projects;
}

export async function getProject(id: string) {
  const docRef = await doc(dbs.projects, id);
  const projectDoc = await getDoc(docRef);
  return { ...projectDoc.data()!, id: projectDoc.id };
}

export async function addProject(token: Partial<IProject>) {
  const resp = await addDoc(dbs.projects, token);
  return resp;
}

export async function deleteProject(id: string) {
  const docRef = await doc(dbs.projects, id);
  await deleteDoc(docRef);
}

export async function patchProject(id: DocumentReference<Partial<IProject>> | string, token: Partial<IProject>) {
  const docRef = typeof id === "string" ? await doc(dbs.projects, id) : id;
  await updateDoc(docRef, token);
}
