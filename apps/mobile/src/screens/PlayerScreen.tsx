import { useEffect } from "react";
import { Platform, StyleSheet, Text, View, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { classifyPlayback } from "@streamerr/client";
import { PlayerScreen as SharedPlayer } from "@streamerr/native-ui";
import { NativeVideoSurface } from "../NativeVideoSurface";
import { colors } from "../theme";
import type { RootStackParamList } from "../nav";

export function PlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "Player">>();
  const params = route.params;
  const kind = classifyPlayback(params.source);
  const iosLiveBlocked = Platform.OS === "ios" && kind === "mpegts";

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  if (iosLiveBlocked) {
    return (
      <View style={styles.block}>
        <Text style={styles.blockText}>
          Live TV on iOS needs a server HLS remux (coming soon). Use Android or the website for live
          channels.
        </Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SharedPlayer
      params={params}
      storage={AsyncStorage}
      VideoSurface={NativeVideoSurface}
      onClose={() => navigation.goBack()}
      onReplaceParams={(next) => navigation.setParams(next as never)}
      liveZapEnabled={Platform.OS !== "ios"}
      userAgent={Platform.OS === "ios" ? "StreamerrMobile/1.0" : "ExoPlayerLib/2.19.1"}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  blockText: { color: colors.danger, fontSize: 16, textAlign: "center" },
  close: { color: colors.text, fontWeight: "700", fontSize: 16 },
});
