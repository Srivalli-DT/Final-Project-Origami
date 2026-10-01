import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Library from "./pages/Library";
import Player from "./pages/Player";
import Studio from "./pages/Studio";
import { RuleDetail, RulesList } from "./pages/Rules";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Library />} />
        <Route path="/library" element={<Navigate to="/" replace />} />
        <Route path="/t/:id" element={<Player />} />
        <Route path="/studio" element={<Studio />} />
        {/* rule explanations, linked from the Studio's rule checks */}
        <Route path="/rules" element={<RulesList />} />
        <Route path="/rules/:id" element={<RuleDetail />} />
        <Route path="*" element={<p className="p-6 text-muted">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
