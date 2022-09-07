import * as express from "express";
import { Storage } from "@google-cloud/storage";
import * as Multer from "multer";
const app = express();
const port = 4000;

const projectId = "";
const keyFilename = "";
const bucketName = "";

const storage = new Storage({ projectId, keyFilename });
const bucket = storage.bucket(bucketName);
const multer = Multer({
  storage: Multer.memoryStorage(),
  limits: {
    fieldSize: 5 * 1024 * 1024, // 5 megs
  },
});

app.get("/", (req, res) => {
  res.send("ok");
});

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
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

app.listen(port, () => {});
