import "react-native";

declare module "react-native" {
  export function useTVEventHandler(handler: (evt: { eventType: string } | undefined) => void): void;

  interface PressableStateCallbackType {
    focused?: boolean;
  }
}
