import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./theme";

// nastavý dark/light ešte pred renderom
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />  {/* ⬅️ App teraz obsahuje všetky Routes */}
  </React.StrictMode>
);