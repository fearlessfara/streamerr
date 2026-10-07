import { RequestsScreen as SharedRequests } from "@streamerr/native-ui";
import { Chrome } from "../components/Chrome";
import { useScreenNav } from "../useScreenNav";

export function RequestsScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <Chrome username={username}>
      <SharedRequests nav={nav} />
    </Chrome>
  );
}
