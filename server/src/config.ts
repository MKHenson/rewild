import { readFileSync } from "fs";

const result = readFileSync(__dirname + "/../keys/config.json", "utf8");
export const config = JSON.parse(result.toString()) as {
  projectId: string;
  keyFilename: string;
  bucketName: string;
  database: {
    host: string;
    port: number;
    user: string;
    name: string;
    password: string;
  };
};
