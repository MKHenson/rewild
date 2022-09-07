import { Storage } from "@google-cloud/storage";
import { readFileSync } from "fs";

const result = readFileSync(__dirname + "/../keys/config.json", "utf8");
const config = JSON.parse(result.toString());

const projectId = config.projectId;
const keyFilename = config.keyFilename;
const bucketName = config.bucketName;

export const storage = new Storage({ projectId, keyFilename });
export const bucket = storage.bucket(bucketName);
