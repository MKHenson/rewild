import { doc, getDoc } from 'firebase/firestore';
import { dbs } from '../firebase';
import { db } from '../database/database';
import { IProject } from 'models';

export async function getProjects(onlyStartup: boolean, cursor?: any) {
  const resp = await db.projects.getMany({
    limit: 30,
    cursor,
    sort: [['created', 'desc']],
    where: onlyStartup ? [['activeOnStartup', '==', true]] : undefined,
  });

  return resp.items;
}

export async function getProject(id: string) {
  const docRef = await doc(dbs.projects, id);
  const projectDoc = await getDoc(docRef);
  return { ...projectDoc.data()!, id: projectDoc.id };
}

export async function addProject(token: Partial<IProject>) {
  const resp = await db.projects.add(token as IProject);
  return resp;
}

export async function deleteProject(id: string) {
  await db.projects.remove(id);
}

export async function patchProject(id: string, token: Partial<IProject>) {
  await db.projects.patch(id, token as IProject);
}
