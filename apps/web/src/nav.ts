import type { DetailsParams } from "@streamerr/native-ui";
import type { MediaIdentity, PlaybackSource } from "@streamerr/shared";

export type LiveChannelRef = {
  uuid: string;
  name: string;
  number?: number;
};

export type PlayParams = {
  source: PlaybackSource;
  title?: string;
  live?: boolean;
  identity?: MediaIdentity;
  channelUuid?: string;
  liveChannels?: LiveChannelRef[];
};

export type RootStackParamList = {
  Boot: undefined;
  Server: { change?: boolean } | undefined;
  Login: undefined;
  Home: undefined;
  Movies: undefined;
  Series: undefined;
  Search: { q?: string } | undefined;
  Live: undefined;
  Downloads: undefined;
  Requests: undefined;
  Details: DetailsParams;
  Player: PlayParams;
  Profile: undefined;
};
