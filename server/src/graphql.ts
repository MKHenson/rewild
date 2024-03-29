import "./scalars/enums";
import { printSchema } from "graphql";
import { writeFileSync } from "fs";
import { buildSchema } from "type-graphql";
import { SystemResolver } from "./resolvers/system-resolver";
import { FileResolver } from "./resolvers/file-resolver";
import { ProjectResolver } from "./resolvers/project-resolver";

export async function generateSchema() {
  const schema = await buildSchema({
    resolvers: [SystemResolver, ProjectResolver, FileResolver],
  });

  return schema;
}

export async function writeSchemaToFile(file: string) {
  try {
    console.log("Starting Schema generatation...");
    const schema = await generateSchema();
    console.log("Schema generated...");
    writeFileSync(file, printSchema(schema), "utf8");
    console.log(`Schema written to ["${file}"]...`);
  } catch (err) {
    console.error(`Something went wrong`);
    console.error(`Could not generate schema ["${err.message} ${err.stack}"]`);
  }
}
