import { Application } from "./ui/application/Application";
import { ThemeProvider } from "solid-styled-components";
import { theme } from "./ui/theme";
import { render } from "solid-js/web";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(
      () => (
        <ThemeProvider theme={theme}>
          <Application />
        </ThemeProvider>
      ),
      document.querySelector("#application") as HTMLDivElement
    );
  }
});
