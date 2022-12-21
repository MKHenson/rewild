import {
  addDoc,
  deleteDoc,
  doc,
  DocumentReference,
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
import { ILevel } from "models";

export async function getLevel(projectId: string) {
  const resp = await query<ILevel>(dbs.levels, where("project", "==", projectId));
  const toRet = await getDocs(resp);
  const levels = toRet.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

  if (levels.length === 0) throw new Error("No level found for project");
  return levels.at(0)!;
}

export async function getLevels(projectId: string, page?: QueryDocumentSnapshot<ILevel>) {
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
}

export async function addLevel(token: Partial<ILevel>) {
  const resp = await addDoc(dbs.levels, token);
  return resp;
}

export async function deleteLevel(id: string) {
  const docRef = await doc(dbs.levels, id);
  await deleteDoc(docRef);
}

export async function patchLevel(id: DocumentReference<Partial<ILevel>> | string, token: Partial<ILevel>) {
  const docRef = typeof id === "string" ? await doc(dbs.levels, id) : id;
  await updateDoc(docRef, token);
}
