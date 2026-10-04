import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusable, Wordmark } from "@streamerr/ui";
import { logout, searchMedia } from "../lib/api";
import { mediaHref } from "../lib/media";

const LINKS = [
  { to: "/", label: "Home", focusId: "nav-home" },
  { to: "/movies", label: "Movies", focusId: "nav-movies" },
  { to: "/series", label: "Series", focusId: "nav-series" },
  { to: "/live", label: "Live TV", focusId: "nav-live" },
  { to: "/downloads", label: "Downloads", focusId: "nav-downloads" },
  { to: "/requests", label: "Requests", focusId: "nav-requests" },
] as const;

/** Wait for typing to settle before searching / updating the URL. */
const SEARCH_DEBOUNCE_MS = 500;

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
  const [debouncedQ, setDebouncedQ] = useState(() => searchValue.trim());
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  // Debounce typed query — do not navigate/search on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(searchValue.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchValue]);

  // Sync URL from debounced query without stealing focus.
  useEffect(() => {
    if (!searchOpen) return;
    if (debouncedQ.length >= 2) {
      const next = `/search?q=${encodeURIComponent(debouncedQ)}`;
      const current = `${location.pathname}${location.search}`;
      if (current !== next) navigate(next, { replace: true });
    } else if (debouncedQ.length === 0 && location.pathname.startsWith("/search")) {
      const next = "/search";
      if (`${location.pathname}${location.search}` !== next) {
        navigate(next, { replace: true });
      }
    }
  }, [debouncedQ, searchOpen, navigate, location.pathname, location.search]);

  // Sync input from URL only when the field is not focused (e.g. back/forward).
  useEffect(() => {
    if (!location.pathname.startsWith("/search")) return;
    setSearchOpen(true);
    if (document.activeElement === searchRef.current) return;
    const q = new URLSearchParams(location.search).get("q");
    if (q !== null) setSearchValue(q);
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

  useEffect(() => {
    if (!panelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setPanelOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [panelOpen]);

  const liveSearch = useQuery({
    queryKey: ["search", "live", debouncedQ],
    queryFn: () => searchMedia(debouncedQ),
    enabled: searchOpen && debouncedQ.length >= 2,
    placeholderData: (prev) => prev,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await qc.resetQueries();
      navigate("/login", { replace: true });
    },
  });

  const isSolid = solid || scrolled || searchOpen;
  const profileInitial = ((username ?? "U").trim()[0] || "U").toUpperCase();
  const showPanel =
    panelOpen && searchOpen && (debouncedQ.length >= 2 || searchValue.trim().length >= 2);
  const panelItems = liveSearch.data?.items.slice(0, 8) ?? [];

  const submitSearch = (e?: FormEvent) => {
    e?.preventDefault();
    const q = searchValue.trim();
    setDebouncedQ(q);
    setPanelOpen(false);
    if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`);
    else navigate("/search");
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
          <div className="header-search-wrap" ref={searchWrapRef}>
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
                    setPanelOpen(false);
                    if (location.pathname.startsWith("/search")) navigate("/");
                  } else {
                    setSearchOpen(true);
                    setPanelOpen(true);
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
                  setPanelOpen(true);
                }}
                onFocus={() => setPanelOpen(true)}
                placeholder="Titles, people, genres"
                aria-label="Search movies and series"
                aria-autocomplete="list"
                aria-controls="header-search-results"
                aria-expanded={showPanel}
              />
            </form>

            {showPanel ? (
              <div
                id="header-search-results"
                className="header-search-panel"
                role="listbox"
                aria-label="Search results"
              >
                {searchValue.trim().length < 2 ? (
                  <div className="header-search-panel-status">Type at least 2 characters…</div>
                ) : searchValue.trim() !== debouncedQ ? (
                  <div className="header-search-panel-status">Searching…</div>
                ) : liveSearch.isFetching && !liveSearch.data ? (
                  <div className="header-search-panel-status">Searching…</div>
                ) : liveSearch.isError ? (
                  <div className="header-search-panel-status is-error">
                    {(liveSearch.error as Error).message}
                  </div>
                ) : panelItems.length === 0 ? (
                  <div className="header-search-panel-status">No matches.</div>
                ) : (
                  <ul className="header-search-list">
                    {panelItems.map((item) => {
                      const href = mediaHref(item);
                      const key =
                        item.identity.jellyfinItemId ??
                        `${item.identity.mediaType}-${item.identity.tmdbId ?? item.metadata.title}`;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            role="option"
                            className="header-search-item"
                            onMouseDown={(e) => {
                              // Prevent input blur before navigation.
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setPanelOpen(false);
                              if (href) navigate(href);
                            }}
                          >
                            {item.metadata.posterUrl ? (
                              <img
                                className="header-search-poster"
                                src={item.metadata.posterUrl}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span className="header-search-poster is-empty" aria-hidden="true" />
                            )}
                            <span className="header-search-item-meta">
                              <span className="header-search-item-title">{item.metadata.title}</span>
                              <span className="header-search-item-sub">
                                {[
                                  item.metadata.year,
                                  item.identity.mediaType !== "other"
                                    ? item.identity.mediaType
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {debouncedQ.length >= 2 ? (
                  <button
                    type="button"
                    className="header-search-more"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPanelOpen(false);
                      navigate(`/search?q=${encodeURIComponent(debouncedQ)}`);
                      searchRef.current?.focus();
                    }}
                  >
                    See all results for “{debouncedQ}”
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

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
