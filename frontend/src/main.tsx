import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

if (import.meta.env.DEV) {
  // dev-only accessibility audit; logs violations to the console
  Promise.all([import("@axe-core/react"), import("react-dom")]).then(([axe, dom]) =>
    axe.default(React, dom, 1000),
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
