import { Application } from "./ui/application/Application";
import { ThemeProvider } from "solid-styled-components";
import { AuthProvider } from "./ui/providers/AuthProvider";
import { theme } from "./ui/theme";
import { render } from "solid-js/web";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(
      () => (
        <ThemeProvider theme={theme}>
          <AuthProvider>
            <Application />
          </AuthProvider>
        </ThemeProvider>
      ),
      document.querySelector("#application") as HTMLDivElement
    );
  }
});
