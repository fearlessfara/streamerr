import { SearchScreen as SharedSearch } from "@streamerr/native-ui";
import { ScreenHeader } from "../components/ScreenHeader";
import { useMobileLayout } from "../layout";
import { useScreenNav } from "../useScreenNav";

export function SearchScreen({ username }: { username: string }) {
  const layout = useMobileLayout();
  const nav = useScreenNav();
  return (
    <SharedSearch
      layout={layout}
      nav={nav}
      header={<ScreenHeader username={username} title="Search" />}
    />
  );
}
