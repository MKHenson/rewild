// import { Application } from "./ui/application/Application";
// import { ThemeProvider } from "solid-styled-components";
// import { Router } from "@solidjs/router";
// import { AuthProvider } from "./ui/AuthProvider";
// import { theme } from "./ui/theme";
// import { render } from "solid-js/web";
import "./initJSX";
import { Application } from "./ui/application/Application";
import { Router } from "./ui/common/Router";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    document.querySelector("#application")!.append(
      <Router>
        <Application />
      </Router>
    );
  }
});
