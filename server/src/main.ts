import "reflect-metadata";
import * as express from "express";
import * as Multer from "multer";
import * as yargs from "yargs";
import { bucket } from "./googleStorage";
import { graphqlHTTP } from "express-graphql";
import { generateSchema, writeSchemaToFile } from "./graphql";

const app = express();
const port = 4000;

const args: any = yargs.argv;

async function start() {
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
      } else throw new Error("Please specify form data with a field of 'file'");
    } catch (err) {
      res.status(500).send(err);
    }
  });

  app.listen(port, () => {});
  console.log("\x1b[36m%s\x1b[0m", "Server Ready!"); //cyan
}

start();
