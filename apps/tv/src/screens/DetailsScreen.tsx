import { useRoute, type RouteProp } from "@react-navigation/native";
import { DetailsScreen as SharedDetails } from "@streamerr/native-ui";
import type { RootStackParamList } from "../nav";
import { useTvLayout } from "../layout";
import { useScreenNav } from "../useScreenNav";

export function DetailsScreen(_props: { username: string }) {
  const layout = useTvLayout();
  const nav = useScreenNav();
  const route = useRoute<RouteProp<RootStackParamList, "Details">>();
  return (
    <SharedDetails
      nav={nav}
      params={route.params}
      focusMode="tv"
      appearance="web"
      layout={layout}
    />
  );
}
