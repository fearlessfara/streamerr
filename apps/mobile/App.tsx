import { type JSX, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { me } from "@streamerr/client";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { MainTabParamList, Nav, RootStackParamList } from "./src/nav";
import { attachClient, loadServerUrl } from "./src/session";
import { colors } from "./src/theme";
import { ServerScreen } from "./src/screens/ServerScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CatalogScreen } from "./src/screens/CatalogScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { DetailsScreen } from "./src/screens/DetailsScreen";
import { LiveScreen } from "./src/screens/LiveScreen";
import { DownloadsScreen } from "./src/screens/DownloadsScreen";
import { RequestsScreen } from "./src/screens/RequestsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import { BootSkeleton } from "./src/components/Skeleton";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
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
      const url = await loadServerUrl();
      if (!url) {
        navigation.reset({ index: 0, routes: [{ name: "Server" }] });
        return;
      }
      attachClient(url);
      try {
        await me();
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
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
const Movies = withUser((p) => <CatalogScreen {...p} mediaType="movie" title="Movies" />);
const Series = withUser((p) => <CatalogScreen {...p} mediaType="tv" title="Series" />);
const Search = withUser(SearchScreen);
const Live = withUser(LiveScreen);
const Downloads = withUser(DownloadsScreen);
const Requests = withUser(RequestsScreen);
const Details = withUser((_p) => <DetailsScreen />);

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>
      {label}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="Movies"
        component={Movies}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Movies" focused={focused} />,
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="Series"
        component={Series}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Series" focused={focused} />,
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="Live"
        component={Live}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Live" focused={focused} />,
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="Search"
        component={Search}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="Search" focused={focused} />,
          tabBarIcon: () => null,
        }}
      />
    </Tab.Navigator>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <NavigationContainer>
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
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Details" component={Details} />
            <Stack.Screen name="Downloads" component={Downloads} />
            <Stack.Screen name="Requests" component={Requests} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Player" component={PlayerScreen} options={{ animation: "fade" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg1,
    borderTopColor: colors.bg2,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 58,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tabLabelActive: { color: colors.text, fontWeight: "700" },
});
