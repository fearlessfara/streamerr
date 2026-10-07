import { DownloadsScreen as SharedDownloads } from "@streamerr/native-ui";
import { Chrome } from "../components/Chrome";
import { useScreenNav } from "../useScreenNav";

export function DownloadsScreen({ username }: { username: string }) {
  const nav = useScreenNav();
  return (
    <Chrome username={username}>
      <SharedDownloads nav={nav} />
    </Chrome>
  );
}
