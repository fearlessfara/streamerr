import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerScreen as SharedPlayer } from "@streamerr/native-ui";
import { NativeVideoSurface } from "../NativeVideoSurface";
import type { RootStackParamList } from "../nav";

export function PlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const insets = useSafeAreaInsets();
  const params = route.params;

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => null);
    return () => {
      void ScreenOrientation.unlockAsync().catch(() => null);
    };
  }, []);

  return (
    <SharedPlayer
      params={params}
      storage={AsyncStorage}
      VideoSurface={NativeVideoSurface}
      onClose={() => navigation.goBack()}
      onReplaceParams={(next) => navigation.setParams(next as never)}
      liveZapEnabled
      userAgent={Platform.OS === "ios" ? "StreamerrMobile/1.0" : "ExoPlayerLib/2.19.1"}
      chromeInsets={insets}
    />
  );
}
