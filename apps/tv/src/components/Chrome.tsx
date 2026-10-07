import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { logout } from "@streamerr/client";
import { Shade, webBg } from "@streamerr/native-ui";
import type { Nav, RootStackParamList } from "../nav";
import { isTvFocused } from "../focus";
import { useTvLayout } from "../layout";
import { clearSession } from "../session";

const LINKS: Array<{ name: keyof RootStackParamList; label: string }> = [
  { name: "Home", label: "Home" },
  { name: "Movies", label: "Movies" },
  { name: "Series", label: "Series" },
  { name: "Live", label: "Live TV" },
];

export function Chrome({
  username,
  children,
  overlay = false,
  scrolled = false,
}: {
  username?: string;
  children: ReactNode;
  /** Home sits under a transparent bar until the page scrolls. */
  overlay?: boolean;
  scrolled?: boolean;
}) {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const layout = useTvLayout();
  const [menuOpen, setMenuOpen] = useState(false);
  const solid = !overlay || scrolled || menuOpen;
  const initial = ((username ?? "U").trim()[0] || "U").toUpperCase();

  async function signOut() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    await clearSession();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  }

  return (
    <View style={styles.shell}>
      {menuOpen ? (
        <Pressable style={styles.dismiss} onPress={() => setMenuOpen(false)} />
      ) : null}
      <View
        style={[
          styles.header,
          { paddingHorizontal: layout.pageX, height: layout.headerH },
          solid ? styles.headerSolid : null,
        ]}
      >
        {!solid ? <Shade kind="header-top" /> : null}
        <Pressable onPress={() => navigation.navigate("Home")}>
          <Text style={styles.wordmark}>STREAMERR</Text>
        </Pressable>
        <View style={styles.nav}>
          {LINKS.map((link) => {
            const active = route.name === link.name;
            return (
              <Pressable
                key={link.name}
                onPress={() => navigation.navigate(link.name as never)}
                style={(s) => [
                  styles.link,
                  active && styles.linkActive,
                  isTvFocused(s) && styles.linkFocused,
                ]}
              >
                {(state) => (
                  <Text
                    style={[
                      styles.linkText,
                      active && styles.linkTextActive,
                      isTvFocused(state) && styles.linkTextFocused,
                    ]}
                  >
                    {link.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.tools}>
          <Pressable
            onPress={() => navigation.navigate("Search")}
            style={(s) => [styles.iconBtn, isTvFocused(s) && styles.iconFocused]}
            accessibilityLabel="Search"
          >
            <Text style={styles.icon}>⌕</Text>
          </Pressable>
          <View>
            <Pressable
              onPress={() => setMenuOpen((v) => !v)}
              style={(s) => [styles.avatar, isTvFocused(s) && styles.avatarFocused]}
            >
              <Text style={styles.avatarText}>{initial}</Text>
            </Pressable>
            {menuOpen ? (
              <View style={styles.menu}>
                <Text style={styles.menuName}>{username || "Profile"}</Text>
                <Pressable
                  style={(s) => [styles.menuItem, isTvFocused(s) && styles.menuItemFocused]}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate("Downloads");
                  }}
                >
                  <Text style={styles.menuText}>Downloads</Text>
                </Pressable>
                <Pressable
                  style={(s) => [styles.menuItem, isTvFocused(s) && styles.menuItemFocused]}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate("Requests");
                  }}
                >
                  <Text style={styles.menuText}>Requests</Text>
                </Pressable>
                <Pressable
                  style={(s) => [styles.menuItem, isTvFocused(s) && styles.menuItemFocused]}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate("Server", { change: true });
                  }}
                >
                  <Text style={styles.menuText}>Change server</Text>
                </Pressable>
                <Pressable
                  style={(s) => [styles.menuItem, isTvFocused(s) && styles.menuItemFocused]}
                  onPress={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                >
                  <Text style={styles.menuText}>Sign out</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: webBg },
  dismiss: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  headerSolid: { backgroundColor: webBg },
  wordmark: {
    color: "#e50914",
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: -0.6,
    marginRight: 12,
  },
  nav: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2 },
  link: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24 },
  linkActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  linkFocused: { backgroundColor: "rgba(255,255,255,0.28)" },
  linkText: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "400" },
  linkTextActive: { color: "#fff" },
  linkTextFocused: { color: "#fff", fontWeight: "600" },
  tools: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  iconFocused: { backgroundColor: "rgba(255,255,255,0.2)" },
  icon: { color: "#fff", fontSize: 24, lineHeight: 26 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: "#e50914",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarFocused: { borderColor: "#fff" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  menu: {
    position: "absolute",
    top: 44,
    right: 0,
    minWidth: 200,
    backgroundColor: "rgba(0,0,0,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 4,
    paddingVertical: 6,
    zIndex: 50,
  },
  menuName: {
    color: "#e5e5e5",
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    marginBottom: 4,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 12 },
  menuItemFocused: { backgroundColor: "rgba(255,255,255,0.12)" },
  menuText: { color: "#fff", fontSize: 15 },
  body: { flex: 1 },
});
