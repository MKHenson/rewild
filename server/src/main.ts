import "reflect-metadata";
import * as express from "express";
import * as Multer from "multer";
import * as yargs from "yargs";
import { bucket } from "./googleStorage";
import { graphqlHTTP } from "express-graphql";
import { generateSchema, writeSchemaToFile } from "./graphql";
import { initDb } from "./db";

const app = express();
export const host = "127.0.0.1";
export const port = 4000;

const args: any = yargs.argv;

export async function start() {
  try {
    console.log("Starting Server...");

    if (args.writeSchema) {
      console.log("Writing schema file to schema.graphql");
      try {
        await writeSchemaToFile("./schema.graphql");
        console.log("\x1b[36m%s\x1b[0m", "Schema writen to './schema.graphql'"); //cyan
        process.exit();
      } catch (err) {
        console.error(err.message);
        process.exit();
      }
    }

    console.log("Initializing Database...");
    await initDb();
    console.log("Database initialized...");

    const multer = Multer({
      storage: Multer.memoryStorage(),
      limits: {
        fieldSize: 5 * 1024 * 1024, // 5 megs
      },
    });

    app.get("/", (req, res) => {
      res.send("ok");
    });

    const schema = await generateSchema();

    // CORS
    app.use((req, res, next) => {
      if (req.headers.origin) {
        res.setHeader(
          "Access-Control-Allow-Origin",
          req.headers.origin as string
        );
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,PUT,POST,DELETE,OPTIONS"
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, Content-Length, X-Requested-With, X-Mime-Type, X-File-Name, Cache-Control"
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }

      if (req.method === "OPTIONS") {
        res.status(200);
        res.end();
      } else next();
    });

    // bind express with graphql
    app.use(
      "/graphql",
      graphqlHTTP({
        schema: schema,
        graphiql: true,
      })
    );

    app.get("/files", async (req, res) => {
      const [files] = await bucket.getFiles();
      const toRet = files.map((f) => ({
        url: f.publicUrl(),
        meta: f.metadata,
      }));
      res.send(toRet);
    });

    app.post("/upload", multer.single("file"), (req, res) => {
      try {
        if (req.file) {
          const blob = bucket.file(req.file.originalname);
          const blobStream = blob.createWriteStream();
          blobStream.on("finish", () => {
            res.status(200).send("success");
          });
          blobStream.end(req.file.buffer);
        } else
          throw new Error("Please specify form data with a field of 'file'");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    app.listen(port, host, () => {});
    console.log("\x1b[36m%s\x1b[0m", "Server Ready!"); //cyan
  } catch (err) {
    console.error(err);
  }
}

if (!args.runningTests) {
  start();
}
