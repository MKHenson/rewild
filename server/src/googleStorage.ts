import { Storage } from "@google-cloud/storage";
import { config } from "./config";

const projectId = config.projectId;
const keyFilename = config.keyFilename;
const bucketName = config.bucketName;

export const storage = new Storage({ projectId, keyFilename });
export const bucket = storage.bucket(bucketName);
