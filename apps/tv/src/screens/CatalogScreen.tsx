import { CatalogScreen as SharedCatalog } from "@streamerr/native-ui";
import { Chrome } from "../components/Chrome";
import { TvTextInput } from "../components/TvTextInput";
import { useTvLayout } from "../layout";
import { useScreenNav } from "../useScreenNav";

export function CatalogScreen({
  username,
  mediaType,
}: {
  username: string;
  mediaType: "movie" | "tv";
  title: string;
}) {
  const layout = useTvLayout();
  const nav = useScreenNav();
  return (
    <Chrome username={username}>
      <SharedCatalog
        layout={layout}
        nav={nav}
        mediaType={mediaType}
        focusMode="tv"
        searchInput={({ value, onChangeText }) => (
          <TvTextInput
            style={{
              backgroundColor: "#2f2f2f",
              color: "#fff",
              fontSize: 16,
              padding: 12,
              borderRadius: 4,
              marginBottom: 18,
            }}
            value={value}
            onChangeText={onChangeText}
            placeholder="Filter library…"
            placeholderTextColor="#b3b3b3"
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
      />
    </Chrome>
  );
}
