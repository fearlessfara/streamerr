import { HomeScreen as SharedHome } from "@streamerr/native-ui";
import { Chrome } from "../components/Chrome";
import { useTvLayout } from "../layout";
import { useScreenNav } from "../useScreenNav";

export function HomeScreen({ username }: { username: string }) {
  const layout = useTvLayout();
  const nav = useScreenNav();
  return (
    <Chrome username={username}>
      <SharedHome layout={layout} nav={nav} focusMode="tv" />
    </Chrome>
  );
}
