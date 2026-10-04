import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusable, Wordmark } from "@streamerr/ui";
import { logout } from "../lib/api";

const LINKS = [
  { to: "/", label: "Home", focusId: "nav-home" },
  { to: "/movies", label: "Movies", focusId: "nav-movies" },
  { to: "/series", label: "Series", focusId: "nav-series" },
  { to: "/live", label: "Live TV", focusId: "nav-live" },
  { to: "/downloads", label: "Downloads", focusId: "nav-downloads" },
  { to: "/requests", label: "Requests", focusId: "nav-requests" },
] as const;

function NavFocusLink({
  to,
  label,
  focusId,
  active,
}: {
  to: string;
  label: string;
  focusId: string;
  active: boolean;
}) {
  const focusProps = useFocusable(focusId);
  return (
    <Link
      to={to}
      {...focusProps}
      className={`app-nav-link se-focusable${active ? " active" : ""} ${focusProps.className}`}
    >
      {label}
    </Link>
  );
}

export function AppChrome({
  username,
  children,
  solid,
}: {
  username?: string;
  children: ReactNode;
  solid?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(location.pathname.startsWith("/search"));
  const [searchValue, setSearchValue] = useState(() => {
    if (location.pathname.startsWith("/search")) {
      const q = new URLSearchParams(location.search).get("q");
      return q ?? "";
    }
    return "";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  useEffect(() => {
    if (location.pathname.startsWith("/search")) {
      setSearchOpen(true);
      const q = new URLSearchParams(location.search).get("q");
      if (q !== null) setSearchValue(q);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await qc.resetQueries();
      navigate("/login", { replace: true });
    },
  });

  const isSolid = solid || scrolled || searchOpen;
  const profileInitial = ((username ?? "U").trim()[0] || "U").toUpperCase();

  const submitSearch = (e?: FormEvent) => {
    e?.preventDefault();
    const q = searchValue.trim();
    if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`);
    else if (q.length === 0) navigate("/search");
  };

  return (
    <div className="app-shell">
      <header className={`app-header${isSolid ? " is-solid" : ""}`}>
        <div className="app-nav">
          <Link to="/" aria-label="Streamerr home" className="app-wordmark-link">
            <Wordmark />
          </Link>
          {LINKS.map((link) => {
            const active =
              link.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(link.to);
            return (
              <NavFocusLink
                key={link.to}
                to={link.to}
                label={link.label}
                focusId={link.focusId}
                active={active}
              />
            );
          })}
        </div>
        <div className="app-user">
          <form
            className={`header-search${searchOpen ? " is-open" : ""}`}
            onSubmit={submitSearch}
            role="search"
          >
            <button
              type="button"
              className="header-search-toggle"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => {
                if (searchOpen && !searchValue.trim()) {
                  setSearchOpen(false);
                  if (location.pathname.startsWith("/search")) navigate("/");
                } else {
                  setSearchOpen(true);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                />
              </svg>
            </button>
            <input
              ref={searchRef}
              className="header-search-input"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                const q = e.target.value.trim();
                if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`);
              }}
              placeholder="Titles, people, genres"
              aria-label="Search movies and series"
            />
          </form>

          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="profile-chip profile-chip-btn"
              title={username}
              aria-label={username ? `Account menu for ${username}` : "Account menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="profile-avatar">{profileInitial}</span>
              <span className="profile-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {menuOpen ? (
              <div className="profile-dropdown" role="menu">
                {username ? <div className="profile-dropdown-name">{username}</div> : null}
                <button
                  type="button"
                  role="menuitem"
                  className="profile-dropdown-item"
                  onClick={() => logoutMutation.mutate()}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
