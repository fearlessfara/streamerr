import { type JSX, useEffect } from "react";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { me } from "@streamerr/client";
import { BootSkeleton, colors } from "@streamerr/native-ui";
import { StatusBar } from "expo-status-bar";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./src/nav";
import { attachClient, ensureClient } from "./src/session";
import {
  DetailsScreen,
  DownloadsScreen,
  HomeScreen,
  LiveScreen,
  LoginScreen,
  MoviesScreen,
  PlayerScreen,
  ProfileScreen,
  RequestsScreen,
  SearchScreen,
  SeriesScreen,
  ServerScreen,
} from "./src/screens";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Loading() {
  return <BootSkeleton />;
}

function BootScreen() {
  const navigation = useNavigation<Nav>();
  useEffect(() => {
    void (async () => {
      const url = await ensureClient();
      // Empty string = same-origin / Metro-proxied API (valid). Only null means unset.
      if (url === null) {
        navigation.reset({ index: 0, routes: [{ name: "Server" }] });
        return;
      }
      attachClient(url);
      try {
        await me();
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      } catch {
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    })();
  }, [navigation]);
  return <Loading />;
}

function withUser(Screen: (props: { username: string }) => JSX.Element) {
  return function Wrapped() {
    const navigation = useNavigation<Nav>();
    const session = useQuery({ queryKey: ["me"], queryFn: () => me() });
    useEffect(() => {
      if (session.isError) {
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    }, [navigation, session.isError]);
    if (session.isLoading || session.isError) return <Loading />;
    return <Screen username={session.data?.user.username ?? ""} />;
  };
}

const Home = withUser(HomeScreen);
const Movies = withUser(MoviesScreen);
const Series = withUser(SeriesScreen);
const Search = withUser(SearchScreen);
const Live = withUser(LiveScreen);
const Downloads = withUser(DownloadsScreen);
const Requests = withUser(RequestsScreen);
const Profile = withUser(ProfileScreen);
const Details = withUser((_p) => <DetailsScreen />);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <NavigationContainer
        linking={{
          prefixes: ["/"],
          config: {
            screens: {
              Boot: "",
              Home: "home",
              Movies: "movies",
              Series: "series",
              Search: "search",
              Live: "live",
              Downloads: "downloads",
              Requests: "requests",
              Profile: "profile",
              Details: "media/:type/:tmdbId",
              Player: "play",
              Login: "login",
              Server: "server",
            },
          },
        }}
      >
        <Stack.Navigator
          initialRouteName="Boot"
          screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Boot" component={BootScreen} />
          <Stack.Screen name="Server" component={ServerScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Movies" component={Movies} />
          <Stack.Screen name="Series" component={Series} />
          <Stack.Screen name="Search" component={Search} />
          <Stack.Screen name="Live" component={Live} />
          <Stack.Screen name="Downloads" component={Downloads} />
          <Stack.Screen name="Requests" component={Requests} />
          <Stack.Screen name="Profile" component={Profile} />
          <Stack.Screen
            name="Details"
            component={Details}
            options={{
              presentation: "transparentModal",
              animation: "fade",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen name="Player" component={PlayerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}
