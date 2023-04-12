import "@rewild/ui/compiler/jsx";
import { Application } from "./ui/application/Application";
import { RouterProvider } from "@rewild/ui/lib/common/RouterProvider";

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    document.querySelector("#application")!.append(
      <RouterProvider>
        <Application />
      </RouterProvider>
    );
  }
});
