import "reflect-metadata";
import {} from "mocha";
import { start, host, port } from "../src/main";
import { header } from "./utils/header";

// Start the first test to initialize everything
describe("Initializing tests", function () {
  before(async function () {
    this.timeout(20000);

    try {
      // Initialize the server
      await start();
      await header.init(`http://${host}:${port}`);
    } catch (err) {
      console.error(err);
      process.exit();
    }

    return true;
  });

  it("should be initialized", function (done) {
    return done();
  });
});
