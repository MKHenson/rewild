import { Timestamp } from "firebase/firestore";

export function JSONReviver(key: string, value: any): any {
  const timestamp = value as Timestamp | undefined;
  if (timestamp && timestamp.seconds) return Timestamp.fromMillis(timestamp.seconds * 1000);
  return value;
}
