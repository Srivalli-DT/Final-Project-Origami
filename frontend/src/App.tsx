import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import School from "./pages/School";
import Library from "./pages/Library";
import Player from "./pages/Player";
import Studio from "./pages/Studio";
import { RuleDetail, RulesList } from "./pages/Rules";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<School />} />
        <Route path="/library" element={<Library />} />
        <Route path="/t/:id" element={<Player />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/rules" element={<RulesList />} />
        <Route path="/rules/:id" element={<RuleDetail />} />
        <Route path="/me" element={<Profile />} />
        <Route path="*" element={<p className="p-6 text-muted">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
