import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import { applyMode, Mode } from "@cloudscape-design/global-styles";

// Import CloudScape global styles
import "@cloudscape-design/global-styles/index.css";

/* global document, Office, module, require */

const title = "Redliner Assistant";

// Apply CloudScape light mode
applyMode(Mode.Light);

const rootElement = document.getElementById("container");
const root = rootElement ? createRoot(rootElement) : undefined;

/* Render application after Office initializes */
Office.onReady(() => {
  root?.render(
    <App title={title} />
  );
});

if (module.hot) {
  module.hot.accept("./components/App", () => {
    const NextApp = require("./components/App").default;
    root?.render(NextApp);
  });
}
