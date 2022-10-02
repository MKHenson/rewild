import { getDocs, addDoc } from "firebase/firestore";
import { dbs } from "../../../../firebase";
import { IProject } from "models";

export async function getProjects() {
  const querySnapshot = await getDocs(dbs.projects);
  const toRet = querySnapshot.docs.map((doc) => doc.data());
  return toRet;
}

export async function addProjects(token: IProject) {
  const docRef = await addDoc(dbs.projects, token);
  return docRef.id;
}
