import { Application } from "./ui/application/Application";
import { ThemeProvider } from "solid-styled-components";
import { Router } from "@solidjs/router";
import { AuthProvider } from "./ui/providers/AuthProvider";
import { theme } from "./ui/theme";
import { render } from "solid-js/web";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(
      () => (
        <ThemeProvider theme={theme}>
          <Router>
            <AuthProvider>
              <Application />
            </AuthProvider>
          </Router>
        </ThemeProvider>
      ),
      document.querySelector("#application") as HTMLDivElement
    );
  }
});
