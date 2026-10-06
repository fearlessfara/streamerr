import { z } from "zod";
import { MediaIdentitySchema } from "./identity.js";

export const MediaMetadataSchema = z.object({
  title: z.string(),
  originalTitle: z.string().optional(),
  year: z.number().int().optional(),
  overview: z.string().optional(),
  posterUrl: z.string().optional(),
  backdropUrl: z.string().optional(),
  runtimeMinutes: z.number().optional(),
  /** Exact runtime in seconds when known (preferred over runtimeMinutes * 60). */
  durationSeconds: z.number().nonnegative().optional(),
  /** Episode still (TMDb) when this row is an episode. */
  stillUrl: z.string().optional(),
  airDate: z.string().optional(),
  genres: z.array(z.string()).optional(),
  /** TMDb series status, e.g. "Returning Series". */
  seriesStatus: z.string().optional(),
});
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;

export const JellyfinAvailabilitySchema = z.object({
  provider: z.literal("jellyfin"),
  available: z.boolean(),
  itemId: z.string().optional(),
  qualityLabel: z.string().optional(),
  canPlay: z.boolean(),
  positionSeconds: z.number().optional(),
  durationSeconds: z.number().optional(),
});
export type JellyfinAvailability = z.infer<typeof JellyfinAvailabilitySchema>;

export const CacheAvailabilitySchema = z.object({
  provider: z.literal("cache"),
  available: z.boolean(),
  acquisitionId: z.string().optional(),
  localPath: z.string().optional(),
  bytesDownloaded: z.number().optional(),
  totalBytes: z.number().optional(),
  playbackAvailable: z.boolean(),
  complete: z.boolean(),
});
export type CacheAvailability = z.infer<typeof CacheAvailabilitySchema>;

export const DispatcharrStreamCandidateSchema = z.object({
  streamId: z.string().optional(),
  m3uAccountId: z.number().optional(),
  label: z.string().optional(),
  /** Catalogue/audio language inferred from label or account name (en, it, …). */
  catalogueLanguage: z.string().optional(),
});
export type DispatcharrStreamCandidate = z.infer<typeof DispatcharrStreamCandidateSchema>;

export const DispatcharrAvailabilitySchema = z.object({
  provider: z.literal("dispatcharr"),
  available: z.boolean(),
  movieId: z.number().optional(),
  seriesId: z.number().optional(),
  episodeId: z.number().optional(),
  uuid: z.string().optional(),
  tmdbId: z.string().optional(),
  imdbId: z.string().optional(),
  /** Language inferred from IPTV catalogue title prefix (en, it, …). */
  catalogueLanguage: z.string().optional(),
  candidates: z.array(DispatcharrStreamCandidateSchema).default([]),
  canPlay: z.boolean(),
});
export type DispatcharrAvailability = z.infer<typeof DispatcharrAvailabilitySchema>;

export const RequestAvailabilitySchema = z.object({
  provider: z.literal("seerr"),
  requestable: z.boolean(),
  requestStatus: z.string().optional(),
  mediaStatus: z.string().optional(),
});
export type RequestAvailability = z.infer<typeof RequestAvailabilitySchema>;

export const AvailabilitySchema = z.discriminatedUnion("provider", [
  JellyfinAvailabilitySchema,
  CacheAvailabilitySchema,
  DispatcharrAvailabilitySchema,
  RequestAvailabilitySchema,
]);
export type Availability = z.infer<typeof AvailabilitySchema>;

export const PreferredActionSchema = z.enum([
  "PLAY_JELLYFIN",
  "PLAY_CACHE",
  "PLAY_IPTV",
  "REQUEST",
  "NONE",
]);
export type PreferredAction = z.infer<typeof PreferredActionSchema>;

export const MediaSchema = z.object({
  identity: MediaIdentitySchema,
  metadata: MediaMetadataSchema,
  availability: z.array(AvailabilitySchema),
  preferredAction: PreferredActionSchema,
});
export type Media = z.infer<typeof MediaSchema>;
