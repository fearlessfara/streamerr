import { SearchScreen as SharedSearch } from "@streamerr/native-ui";
import { Chrome } from "../components/Chrome";
import { TvTextInput } from "../components/TvTextInput";
import { useTvLayout } from "../layout";
import { useScreenNav } from "../useScreenNav";

export function SearchScreen({ username }: { username: string }) {
  const layout = useTvLayout();
  const nav = useScreenNav();
  return (
    <Chrome username={username}>
      <SharedSearch
        layout={{ ...layout, gridColumns: 5 }}
        nav={nav}
        focusMode="tv"
        searchInput={({ value, onChangeText }) => (
          <TvTextInput
            style={{
              backgroundColor: "#2f2f2f",
              color: "#fff",
              fontSize: 16,
              padding: 12,
              borderRadius: 4,
              marginBottom: 16,
            }}
            value={value}
            onChangeText={onChangeText}
            placeholder="Find movies and TV…"
            placeholderTextColor="#b3b3b3"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        )}
      />
    </Chrome>
  );
}
