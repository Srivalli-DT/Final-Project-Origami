import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Hub from "./pages/Hub";
import Learn from "./pages/Learn";
import GuidePage from "./pages/GuidePage";
import Upload from "./pages/Upload";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Hub />} />
        <Route path="/learn/:id" element={<Learn />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="*" element={<main className="p-8">Page not found.</main>} />
      </Route>
    </Routes>
  );
}
