import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { getHealth } from "./api";

function Home() {
  const [health, setHealth] = useState("checking…");
  useEffect(() => {
    getHealth()
      .then((h) => setHealth(h.source === "mock" ? `${h.status} (mock)` : h.status))
      .catch(() => setHealth("unreachable"));
  }, []);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="font-serif text-4xl">CreaseLens</h1>
      <p className="mt-4">backend: {health}</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
