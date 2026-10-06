import { useRef } from "react";
import { Pressable, TextInput, type TextInputProps } from "react-native";

/**
 * TV remote: D-pad must land on a Pressable. A focused TextInput hands keys to the
 * system IME, which on many Google TVs drops them (InputEventSender status=-32).
 */
export function TvTextInput({ hasTVPreferredFocus, style, ...props }: TextInputProps) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable hasTVPreferredFocus={hasTVPreferredFocus} onPress={() => ref.current?.focus()}>
      <TextInput ref={ref} {...props} style={style} showSoftInputOnFocus focusable={false} />
    </Pressable>
  );
}
