import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { me } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { DetailsPage } from "./pages/DetailsPage";
import { PlayerPage } from "./pages/PlayerPage";
import { MoviesPage } from "./pages/MoviesPage";
import { SeriesPage } from "./pages/SeriesPage";
import { SearchPage } from "./pages/SearchPage";
import { LiveTvPage } from "./pages/LiveTvPage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { RequestsPage } from "./pages/RequestsPage";

export function App() {
  const session = useQuery({
    queryKey: ["me"],
    queryFn: me,
    retry: false,
  });

  if (session.isLoading) {
    return (
      <div className="login-page">
        <p className="tagline">Loading Streamerr…</p>
      </div>
    );
  }

  const authed = Boolean(session.data?.user);
  const username = session.data?.user.username ?? "";

  return (
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={authed ? <HomePage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/movies"
        element={authed ? <MoviesPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/series"
        element={authed ? <SeriesPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/search"
        element={authed ? <SearchPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/live"
        element={authed ? <LiveTvPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/downloads"
        element={authed ? <DownloadsPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/requests"
        element={authed ? <RequestsPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/media/jellyfin/:itemId"
        element={authed ? <DetailsPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/media/:type/:tmdbId"
        element={authed ? <DetailsPage username={username} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/play"
        element={authed ? <PlayerPage /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={authed ? "/" : "/login"} replace />} />
    </Routes>
  );
}
