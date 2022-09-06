import * as express from "express";

const app = express();
const port = 4000;

app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(port, () => {});
