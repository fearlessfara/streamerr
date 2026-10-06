import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { Nav, RootStackParamList } from "../nav";
import { isTvFocused } from "../focus";
import { useTvLayout } from "../layout";
import { colors } from "../theme";

const LINKS: Array<{ name: keyof RootStackParamList; label: string }> = [
  { name: "Home", label: "Home" },
  { name: "Movies", label: "Movies" },
  { name: "Series", label: "Series" },
  { name: "Live", label: "Live TV" },
  { name: "Search", label: "Search" },
  { name: "Downloads", label: "Downloads" },
  { name: "Requests", label: "Requests" },
];

export function Chrome({
  username,
  children,
}: {
  username?: string;
  children: ReactNode;
}) {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const layout = useTvLayout();
  return (
    <View style={styles.shell}>
      <View style={[styles.header, { height: layout.headerH, paddingHorizontal: layout.pageX }]}>
        <Text style={styles.wordmark}>STREAMERR</Text>
        <View style={styles.nav}>
          {LINKS.map((link) => {
            const active = route.name === link.name;
            return (
              <Pressable
                key={link.name}
                onPress={() => navigation.navigate(link.name as never)}
                style={(s) => [styles.link, isTvFocused(s) && styles.linkFocused]}
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
        <Pressable
          onPress={() => navigation.navigate("Server", { change: true })}
          style={(s) => [styles.profile, isTvFocused(s) && styles.profileFocused]}
        >
          <Text style={styles.profileText}>{(username ?? "U").slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  wordmark: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  nav: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  link: { paddingHorizontal: 10, paddingVertical: 8 },
  // Netflix-style: no white pill — just brighter text.
  linkFocused: {},
  linkText: { color: "#b3b3b3", fontSize: 15 },
  linkTextActive: { color: colors.text, fontWeight: "700" },
  linkTextFocused: { color: colors.text, fontWeight: "700" },
  profile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  profileFocused: { borderWidth: 2, borderColor: colors.focus },
  profileText: { color: colors.text, fontWeight: "700" },
  body: { flex: 1 },
});
