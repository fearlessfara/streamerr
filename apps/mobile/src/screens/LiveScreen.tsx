import { Platform } from "react-native";
import { LiveScreen as SharedLive } from "@streamerr/native-ui";
import { ScreenHeader } from "../components/ScreenHeader";
import { useScreenNav } from "../useScreenNav";

export function LiveScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <SharedLive
      nav={nav}
      liveSupported={Platform.OS === "android"}
      header={<ScreenHeader username={username} title="Live TV" />}
    />
  );
}
