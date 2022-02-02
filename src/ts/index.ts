import "./ui/index";
import { Application } from "./ui/application/Application";
import { render } from "lit";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(new Application(), document.querySelector("#application") as HTMLDivElement);
  }
});
