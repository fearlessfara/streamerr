import { LiveScreen as SharedLive } from "@streamerr/native-ui";
import { Chrome } from "../components/Chrome";
import { useScreenNav } from "../useScreenNav";

export function LiveScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <Chrome username={username}>
      <SharedLive nav={nav} liveSupported />
    </Chrome>
  );
}
