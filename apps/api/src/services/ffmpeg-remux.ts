import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";
import { Readable as NodeReadable } from "node:stream";

/** Chromium-safe audio codecs for progressive / MSE playback. */
const BROWSER_SAFE_AUDIO = new Set(["aac", "mp3", "opus", "vorbis"]);

export function isBrowserSafeAudioCodec(codec: string | null | undefined): boolean {
  if (!codec) return false;
  const c = codec.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (BROWSER_SAFE_AUDIO.has(c)) return true;
  return c === "mp4a" || c.startsWith("aac");
}

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export interface RemuxOptions {
  /** Seek to this timestamp before remux (seconds). */
  startSeconds?: number;
  /** Abort remux (client disconnect / IPTV lease preempt). */
  signal?: AbortSignal;
}

const OUTPUT_ARGS = [
  "-map",
  "0:v:0",
  "-map",
  "0:a:0?",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-ac",
  "2",
  "-b:a",
  "192k",
  "-movflags",
  "frag_keyframe+empty_moov+default_base_moof",
  "-f",
  "mp4",
  "pipe:1",
] as const;

function buildPipeArgs(opts?: RemuxOptions): string[] {
  const start = opts?.startSeconds && opts.startSeconds > 0 ? opts.startSeconds : 0;
  const args = ["-hide_banner", "-loglevel", "error", "-i", "pipe:0"];
  // Output seek for pipes (cannot input-seek a non-seekable stream).
  if (start > 0) args.push("-ss", String(start));
  args.push(...OUTPUT_ARGS);
  return args;
}

function buildFileArgs(filePath: string, opts?: RemuxOptions): string[] {
  const start = opts?.startSeconds && opts.startSeconds > 0 ? opts.startSeconds : 0;
  const args = ["-hide_banner", "-loglevel", "error"];
  if (start > 0) args.push("-ss", String(start));
  args.push("-i", filePath, ...OUTPUT_ARGS);
  return args;
}

function buildUrlArgs(
  url: string,
  headers: Record<string, string>,
  opts?: RemuxOptions,
): string[] {
  const start = opts?.startSeconds && opts.startSeconds > 0 ? opts.startSeconds : 0;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    // Block non-HTTP protocols from hostile playlists (file, concat, etc.).
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
  ];
  // Input seek — ffmpeg can Range/seek when the source is a URL/file.
  if (start > 0) args.push("-ss", String(start));
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  if (headerLines) {
    args.push("-headers", `${headerLines}\r\n`);
  }
  args.push("-i", url, ...OUTPUT_ARGS);
  return args;
}

function attachProcess(
  ff: ChildProcessWithoutNullStreams,
  input?: Readable,
  signal?: AbortSignal,
): { stream: PassThrough; proc: ChildProcessWithoutNullStreams } {
  const out = new PassThrough();
  let stderr = "";

  const kill = (err?: Error) => {
    try {
      if (!ff.killed) ff.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    if (!out.destroyed) {
      if (err) out.destroy(err);
      else out.destroy();
    }
  };

  if (signal) {
    if (signal.aborted) kill();
    else signal.addEventListener("abort", () => kill(), { once: true });
  }

  // Missing binary / spawn failure must not crash the Node process.
  ff.on("error", (err) => {
    kill(err instanceof Error ? err : new Error(String(err)));
  });

  ff.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  if (input) {
    input.pipe(ff.stdin);
    input.on("error", (err) => {
      try {
        ff.stdin.destroy();
      } catch {
        /* ignore */
      }
      kill(err instanceof Error ? err : new Error(String(err)));
    });
    ff.stdin.on("error", () => {
      /* upstream closed */
    });
  } else {
    ff.stdin.end();
  }

  ff.stdout.pipe(out);

  ff.on("close", (code) => {
    if (code && code !== 0 && !out.destroyed) {
      out.destroy(
        new Error(`ffmpeg remux failed (exit ${code}): ${stderr.trim() || "unknown error"}`),
      );
    } else if (!out.destroyed) {
      out.end();
    }
  });

  return { stream: out, proc: ff };
}

/**
 * Remux/transcode a Node readable to fragmented MP4 with AAC audio.
 */
export function remuxToBrowserMp4(
  input: Readable,
  opts?: RemuxOptions,
): {
  stream: PassThrough;
  proc: ChildProcessWithoutNullStreams;
} {
  const ff = spawn(ffmpegBin(), buildPipeArgs(opts), {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return attachProcess(ff, input, opts?.signal);
}

/**
 * Remux a local file (supports fast `-ss` input seek for scrubbing).
 */
export function remuxToBrowserMp4FromFile(
  filePath: string,
  opts?: RemuxOptions,
): {
  stream: PassThrough;
  proc: ChildProcessWithoutNullStreams;
} {
  const ff = spawn(ffmpegBin(), buildFileArgs(filePath, opts), {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return attachProcess(ff, undefined, opts?.signal);
}

/**
 * Remux from an HTTP(S) URL with optional auth headers.
 * Uses `-ss` before `-i` so seeks do not read the whole file from t=0.
 */
export function remuxToBrowserMp4FromUrl(
  url: string,
  headers: Record<string, string>,
  opts?: RemuxOptions,
): {
  stream: PassThrough;
  proc: ChildProcessWithoutNullStreams;
} {
  const ff = spawn(ffmpegBin(), buildUrlArgs(url, headers, opts), {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return attachProcess(ff, undefined, opts?.signal);
}

/** Convert a Web ReadableStream (fetch body) into a Node Readable. */
export function webStreamToNode(stream: ReadableStream<Uint8Array>): Readable {
  return NodeReadable.fromWeb(stream as import("node:stream/web").ReadableStream);
}
