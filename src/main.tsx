import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import App from "./App";
import Home from "./pages/Home";
import Profile from "./pages/Profile";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} /> {/* teraz je Home na hlavnej adrese */}
        <Route path="/profil" element={<Profile />} />
        <Route path="/app" element={<App />} /> {/* ak máš App ako testovaciu stránku */}
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
