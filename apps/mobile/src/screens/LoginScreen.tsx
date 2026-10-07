import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoginScreen as SharedLogin, loginKeyboardBehavior } from "@streamerr/native-ui";
import { useScreenNav } from "../useScreenNav";

export function LoginScreen() {
  const nav = useScreenNav();
  const insets = useSafeAreaInsets();
  return (
    <SharedLogin
      nav={nav}
      storage={AsyncStorage}
      deviceName="Streamerr Mobile"
      paddingTop={insets.top + 32}
      paddingBottom={insets.bottom + 24}
      wrapper={(children) => (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={loginKeyboardBehavior}>
          {children}
        </KeyboardAvoidingView>
      )}
    />
  );
}
