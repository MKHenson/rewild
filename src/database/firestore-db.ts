import { IDataTable, IDataTableQuery } from 'models';
import {
  addDoc,
  CollectionReference,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  startAfter,
  UpdateData,
  updateDoc,
  where,
} from 'firebase/firestore';

export class FirestoreDataTable<T> implements IDataTable<T> {
  collection: CollectionReference<T>;

  constructor(collection: CollectionReference<T>) {
    this.collection = collection;
  }

  async getOne(id: string) {
    const docRef = await doc(this.collection, id);
    const snapshot = await getDoc(docRef);
    return { ...snapshot.data()!, id: snapshot.id };
  }

  async getMany<Query = T>(q: IDataTableQuery<Query>) {
    let constraints: QueryConstraint[] = [];

    if (q.where) {
      for (const whereConstraint of q.where) {
        const [field, operator, value] = whereConstraint;
        constraints.push(where(field as string, operator, value));
      }
    }

    if (q.cursor) constraints.push(startAfter(q.cursor as unknown as T));

    if (q.sort) {
      for (const [field, order] of q.sort) {
        constraints.push(orderBy(field as string, order));
      }
    }

    if (q.limit) constraints.push(limit(q.limit));

    const resp = await query<T>(this.collection, ...constraints);

    const toRet = await getDocs(resp);
    const results = toRet.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    return {
      items: results,
      cursor: results.length ? (results.at(-1) as T) : 0,
    };
  }

  async remove(id: string) {
    const docRef = await doc(this.collection, id);
    await deleteDoc(docRef);
    return true;
  }

  async add(token: T) {
    const docRef = await addDoc(this.collection, token);
    const snapshot = await getDoc(docRef);
    return { ...(snapshot.data() as T), id: snapshot.id };
  }

  async patch(id: string, token: Partial<T>) {
    const docRef = await doc(this.collection, id);
    await updateDoc(docRef, token as UpdateData<T>);
  }
}
