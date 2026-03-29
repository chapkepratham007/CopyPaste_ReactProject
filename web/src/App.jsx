import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ClipPage from "./pages/ClipPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/:clipId" element={<ClipPage />} />
      <Route path="/" element={<Navigate to="/demo" replace />} />
      <Route path="*" element={<Navigate to="/demo" replace />} />
    </Routes>
  );
}
