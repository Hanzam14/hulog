import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./style.css";
import { initializeTheme } from "./theme";
import { initializeInstall } from "./install";
import { initializeUpdates } from "./update";
import { initializeLanguage } from "./i18n";

initializeTheme();
initializeLanguage();
initializeInstall();
initializeUpdates();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
