import { Pressable, Text, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";

export function Button({
  label,
  style,
  variant = "primary",
  ...rest
}: PressableProps & {
  label: string;
  style?: StyleProp<ViewStyle>;
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <Pressable
      {...rest}
      style={(state) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        state.pressed && styles.pressed,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === "primary" && styles.labelOnPrimary,
          variant === "ghost" && styles.labelGhost,
          variant === "danger" && styles.labelOnPrimary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.text },
  ghost: { backgroundColor: colors.bg2 },
  danger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.85 },
  label: { fontSize: 15, fontWeight: "700" },
  labelOnPrimary: { color: colors.bg },
  labelGhost: { color: colors.text },
});
