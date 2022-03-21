// import "./ui/index";
// import { Application } from "./ui/application/Application";
import { SolidApplication } from "./ui/application/SolidApplication";
// import { render } from "lit";
import { render } from "solid-js/web";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    // render(new Application(), document.querySelector("#application") as HTMLDivElement);
    render(() => <SolidApplication />, document.querySelector("#application") as HTMLDivElement);
  }
});
