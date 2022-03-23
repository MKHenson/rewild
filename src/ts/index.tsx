import { SolidApplication } from "./ui/application/SolidApplication";
import { ThemeProvider } from "solid-styled-components";
import { theme } from "./ui/theme";
import { render } from "solid-js/web";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(
      () => (
        <ThemeProvider theme={theme}>
          <SolidApplication />
        </ThemeProvider>
      ),
      document.querySelector("#application") as HTMLDivElement
    );
  }
});
