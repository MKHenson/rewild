import { Application } from "./ui/application/Application";
import { ThemeProvider } from "solid-styled-components";
import { Router } from "@solidjs/router";
import { AuthProvider } from "./ui/AuthProvider";
import { theme } from "./ui/theme";
import { render } from "solid-js/web";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(
      () => (
        <Router>
          <ThemeProvider theme={theme}>
            <AuthProvider>
              <Application />
            </AuthProvider>
          </ThemeProvider>
        </Router>
      ),
      document.querySelector("#application") as HTMLDivElement
    );
  }
});
