import {
  CatalogScreen as SharedCatalog,
  DownloadsScreen as SharedDownloads,
  DetailsScreen as SharedDetails,
  HomeScreen as SharedHome,
  LiveScreen as SharedLive,
  LoginScreen as SharedLogin,
  RequestsScreen as SharedRequests,
  SearchScreen as SharedSearch,
  ServerScreen as SharedServer,
  PlayerScreen as SharedPlayer,
} from "@streamerr/native-ui";
import { WebVideoSurface } from "@streamerr/player-web";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { logout } from "@streamerr/client";
import { colors } from "@streamerr/native-ui";
import { WebChrome } from "./components/WebChrome";
import { useWebLayout } from "./layout";
import type { RootStackParamList } from "./nav";
import { useScreenNav } from "./useScreenNav";
import { clearSession } from "./session";
import { webStorage as storage } from "./storage";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function PageHeading({ title }: { title: string }) {
  const layout = useWebLayout();
  return (
    <View style={{ paddingTop: layout.headerH + 28, paddingHorizontal: layout.pageX, paddingBottom: 8 }}>
      <Text style={styles.pageTitle}>{title}</Text>
    </View>
  );
}

export function HomeScreen({ username }: { username: string }) {
  const layout = useWebLayout();
  const nav = useScreenNav();
  const [scrolled, setScrolled] = useState(false);
  return (
    <WebChrome username={username} overlay scrolled={scrolled}>
      <SharedHome
        layout={layout}
        nav={nav}
        focusMode="touch"
        appearance="web"
        onScrollOffset={(y) => setScrolled(y > 24)}
      />
    </WebChrome>
  );
}

export function MoviesScreen({ username }: { username: string }) {
  const layout = useWebLayout();
  const nav = useScreenNav();
  return (
    <WebChrome username={username}>
      <SharedCatalog layout={layout} nav={nav} mediaType="movie" appearance="web" pageTitle="Movies" />
    </WebChrome>
  );
}

export function SeriesScreen({ username }: { username: string }) {
  const layout = useWebLayout();
  const nav = useScreenNav();
  return (
    <WebChrome username={username}>
      <SharedCatalog layout={layout} nav={nav} mediaType="tv" appearance="web" pageTitle="Series" />
    </WebChrome>
  );
}

export function SearchScreen({ username }: { username: string }) {
  const layout = useWebLayout();
  const nav = useScreenNav();
  const route = useRoute<RouteProp<RootStackParamList, "Search">>();
  return (
    <WebChrome username={username}>
      <SharedSearch layout={layout} nav={nav} appearance="web" initialQuery={route.params?.q ?? ""} />
    </WebChrome>
  );
}

export function LiveScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <WebChrome username={username}>
      <SharedLive nav={nav} liveSupported header={<PageHeading title="Live TV" />} />
    </WebChrome>
  );
}

export function DownloadsScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <WebChrome username={username}>
      <SharedDownloads nav={nav} header={<PageHeading title="Downloads" />} />
    </WebChrome>
  );
}

export function RequestsScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <WebChrome username={username}>
      <SharedRequests nav={nav} header={<PageHeading title="Requests" />} />
    </WebChrome>
  );
}

export function DetailsScreen() {
  const layout = useWebLayout();
  const nav = useScreenNav();
  const route = useRoute<RouteProp<RootStackParamList, "Details">>();
  const params = route.params;
  // No WebChrome — browse stays underneath this transparent modal (Netflix-style).
  if (params?.jellyfinItemId) {
    return (
      <SharedDetails
        nav={nav}
        params={{ jellyfinItemId: params.jellyfinItemId, seed: params.seed }}
        appearance="web"
        layout={layout}
      />
    );
  }
  if (params?.type && params.tmdbId != null) {
    return (
      <SharedDetails
        nav={nav}
        params={{ type: params.type, tmdbId: params.tmdbId, seed: params.seed }}
        appearance="web"
        layout={layout}
      />
    );
  }
  return <SharedDetails nav={nav} params={{ type: "movie", tmdbId: 0 }} appearance="web" layout={layout} />;
}

export function LoginScreen() {
  const nav = useScreenNav();
  return (
    <SharedLogin
      nav={nav}
      storage={storage}
      deviceName="Streamerr Web"
      appearance="web"
      paddingTop={64}
      paddingBottom={48}
    />
  );
}

export function ServerScreen() {
  const nav = useScreenNav();
  const route = useRoute<RouteProp<RootStackParamList, "Server">>();
  return (
    <SharedServer
      nav={nav}
      storage={storage}
      canCancel={Boolean(route.params?.change)}
      paddingTop={64}
      paddingBottom={48}
    />
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  return (
    <SharedPlayer
      params={route.params}
      storage={storage}
      VideoSurface={WebVideoSurface}
      onClose={() => navigation.goBack()}
      onReplaceParams={(next) => navigation.setParams(next as never)}
      liveZapEnabled
      userAgent="StreamerrWeb/1.0"
    />
  );
}

export function ProfileScreen({ username }: { username: string }) {
  const navigation = useNavigation<Nav>();
  return (
    <WebChrome username={username}>
      <View style={[styles.profile, { paddingTop: 68 + 36 }]}>
        <Text style={styles.h1}>Profile</Text>
        <Text style={styles.copy}>Signed in as {username}</Text>
        <Pressable
          style={styles.btn}
          onPress={() => navigation.navigate("Downloads")}
        >
          <Text style={styles.btnText}>Downloads</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => navigation.navigate("Requests")}>
          <Text style={styles.btnText}>Requests</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => navigation.navigate("Server", { change: true })}>
          <Text style={styles.btnText}>Change server</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.danger]}
          onPress={async () => {
            try {
              await logout();
            } catch {
              /* ignore */
            }
            await clearSession();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          }}
        >
          <Text style={styles.btnText}>Sign out</Text>
        </Pressable>
      </View>
    </WebChrome>
  );
}

const styles = StyleSheet.create({
  pageTitle: { color: "#fff", fontSize: 32, fontWeight: "700", letterSpacing: -0.4 },
  profile: { padding: 32, gap: 12, maxWidth: 480 },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 8 },
  copy: { color: colors.muted, marginBottom: 16 },
  btn: {
    backgroundColor: colors.bg2,
    padding: 14,
    borderRadius: 8,
  },
  danger: { backgroundColor: colors.danger },
  btnText: { color: colors.text, fontWeight: "700", fontSize: 15 },
});
