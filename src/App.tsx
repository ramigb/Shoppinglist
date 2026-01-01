import { Layout } from "@/layouts/AppLayout";
import { Routes, Route } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import ListsPage from "@/pages/ListsPage";
import StatsPage from "@/pages/StatsPage";
import AboutPage from "@/pages/AboutPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
