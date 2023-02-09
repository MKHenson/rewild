// import { Application } from "./ui/application/Application";
// import { ThemeProvider } from "solid-styled-components";
// import { Router } from "@solidjs/router";
// import { AuthProvider } from "./ui/AuthProvider";
// import { theme } from "./ui/theme";
// import { render } from "solid-js/web";
import "./initJSX";
import { HelloWorld } from "./ui/Test";

// declare function jsx<T extends keyof JSX.IntrinsicElements = keyof JSX.IntrinsicElements>(
//   tag: T,
//   attributes: {
//     [key: string]: any;
//   } | null,
//   ...children: Node[]
// ): JSX.Element;
// declare function jsx(tag: JSX.Component, attributes: Parameters<typeof tag> | null, ...children: Node[]): Node;
// declare function jsx(tag: JSX.Tag | JSX.Component, attributes: { [key: string]: any } | null, ...children: Node[]): any;

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    //   render(
    //     () => (
    //       <Router>
    //         <ThemeProvider theme={theme}>
    //           <AuthProvider>
    //             <Application />
    //           </AuthProvider>
    //         </ThemeProvider>
    //       </Router>
    //     ),
    //     document.querySelector("#application") as HTMLDivElement
    //   );

    document.body.append(<HelloWorld onClick={() => alert("oh wow")} name="This is a test" />);
  }
});
