import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Readable as NodeReadable } from "node:stream";
import type { IptvConnectionManager, IptvLease } from "./iptv-connection-manager.js";

const READY_TIMEOUT_MS = 35_000;
const IDLE_MS = 120_000;
const REAP_MS = 15_000;
const HLS_TIME = 2;
/** Sliding window — keep enough that AVPlayer can buffer before delete_segments. */
const HLS_LIST_SIZE = 12;
/** Don't hand the playlist to clients until we have a real window. */
const READY_MIN_SEGMENTS = 3;

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function liveHlsDir(dataDir: string, uuid: string): string {
  return join(dataDir, "live-hls", uuid);
}

export function liveHlsPlaylistPath(dataDir: string, uuid: string): string {
  return join(liveHlsDir(dataDir, uuid), "index.m3u8");
}

export function liveHlsSegmentCount(dataDir: string, uuid: string): number {
  const playlist = liveHlsPlaylistPath(dataDir, uuid);
  if (!existsSync(playlist)) return 0;
  try {
    return (readFileSync(playlist, "utf8").match(/#EXTINF:/g) ?? []).length;
  } catch {
    return 0;
  }
}

export function liveHlsReady(dataDir: string, uuid: string): boolean {
  return liveHlsSegmentCount(dataDir, uuid) >= READY_MIN_SEGMENTS;
}

type OpenLiveStream = (opts: {
  uuid: string;
  signal?: AbortSignal;
}) => Promise<Response>;

interface Session {
  uuid: string;
  dir: string;
  lease: IptvLease;
  proc: ChildProcess;
  lastAccess: number;
  startedAt: number;
  stderr: string;
}

/**
 * Remux Dispatcharr live MPEG-TS → sliding-window HLS for AVPlayer (iOS).
 * One ffmpeg session per channel; idle sessions are reaped.
 */
export class LiveHlsManager {
  private readonly sessions = new Map<string, Session>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(
    private readonly dataDir: string,
    private readonly iptv: IptvConnectionManager,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.reapIdle(), REAP_MS);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopAll();
  }

  /** Drop every remux session so VOD/acquisition can take the IPTV slot. */
  stopAll(): void {
    for (const uuid of [...this.sessions.keys()]) this.stopSession(uuid);
  }

  touch(uuid: string): void {
    const s = this.sessions.get(uuid);
    if (s) s.lastAccess = Date.now();
  }

  filePath(uuid: string, relative: string): string | null {
    const clean = relative
      .replace(/\.\./g, "")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/");
    if (!clean || clean.includes("/")) return null;
    const path = join(liveHlsDir(this.dataDir, uuid), clean);
    if (!path.startsWith(liveHlsDir(this.dataDir, uuid))) return null;
    return path;
  }

  /**
   * Ensure a remux session is running and the playlist has at least one segment.
   */
  async ensureReady(uuid: string, openLiveStream: OpenLiveStream): Promise<void> {
    if (this.stopped) throw new Error("Live HLS manager stopped");
    this.start();
    this.touch(uuid);

    if (!this.sessions.has(uuid) || !liveHlsReady(this.dataDir, uuid)) {
      if (!this.sessions.has(uuid)) {
        await this.startSession(uuid, openLiveStream);
      }
      await this.waitReady(uuid);
    }
    this.touch(uuid);
  }

  private async startSession(uuid: string, openLiveStream: OpenLiveStream): Promise<void> {
    // Retune: kill previous remux for this (or any) channel if we're replacing.
    this.stopSession(uuid);

    const dir = liveHlsDir(this.dataDir, uuid);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const lease = this.iptv.acquire("live", { label: `live-hls:${uuid}` });
    let upstream: Response;
    try {
      upstream = await openLiveStream({ uuid, signal: lease.signal });
    } catch (err) {
      lease.release();
      throw err;
    }
    if (!upstream.ok || !upstream.body) {
      lease.release();
      const errText = await upstream.text().catch(() => "");
      throw Object.assign(
        new Error(errText || `Dispatcharr live stream failed (${upstream.status})`),
        { statusCode: upstream.status },
      );
    }

    const playlist = join(dir, "index.m3u8");
    // Re-encode with a fixed GOP so every HLS segment starts on an IDR.
    // Stream-copy looks fine in ffprobe for some channels but AVPlayer still
    // fails with "The resource is unavailable" on live IPTV TS.
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-fflags",
      "+genpts+discardcorrupt",
      "-flags",
      "low_delay",
      "-probesize",
      "2M",
      "-analyzeduration",
      "3M",
      "-i",
      "pipe:0",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "50",
      "-keyint_min",
      "50",
      "-sc_threshold",
      "0",
      "-bf",
      "0",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-b:a",
      "128k",
      "-f",
      "hls",
      "-hls_time",
      String(HLS_TIME),
      "-hls_list_size",
      String(HLS_LIST_SIZE),
      "-hls_flags",
      "delete_segments+independent_segments+omit_endlist",
      "-hls_segment_type",
      "mpegts",
      "-hls_segment_filename",
      join(dir, "seg_%05d.ts"),
      playlist,
    ];

    const proc = spawn(ffmpegBin(), args, { stdio: ["pipe", "ignore", "pipe"] });
    const session: Session = {
      uuid,
      dir,
      lease,
      proc,
      lastAccess: Date.now(),
      startedAt: Date.now(),
      stderr: "",
    };
    this.sessions.set(uuid, session);

    proc.stderr?.on("data", (chunk: Buffer) => {
      session.stderr += chunk.toString("utf8");
      if (session.stderr.length > 4000) session.stderr = session.stderr.slice(-4000);
    });

    proc.on("error", (err) => {
      console.error(`[live-hls] ${uuid} ffmpeg spawn failed`, err);
      this.stopSession(uuid);
    });

    proc.on("close", (code) => {
      if (this.sessions.get(uuid)?.proc === proc) {
        if (code && code !== 0) {
          console.error(
            `[live-hls] ${uuid} ffmpeg exit ${code}: ${session.stderr.trim() || "unknown"}`,
          );
        }
        this.stopSession(uuid);
      }
    });

    const nodeIn = NodeReadable.fromWeb(
      upstream.body as import("node:stream/web").ReadableStream,
    );
    const stdin = proc.stdin;
    if (!stdin) {
      lease.release();
      this.sessions.delete(uuid);
      throw new Error("ffmpeg stdin unavailable");
    }
    nodeIn.pipe(stdin);
    nodeIn.on("error", () => {
      try {
        stdin.destroy();
      } catch {
        /* ignore */
      }
    });
    stdin.on("error", () => {
      /* upstream closed */
    });

    lease.signal.addEventListener(
      "abort",
      () => {
        this.stopSession(uuid);
      },
      { once: true },
    );

    // Marker so empty dirs aren't mistaken for ready.
    writeFileSync(join(dir, ".started"), String(Date.now()));
  }

  private async waitReady(uuid: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (liveHlsReady(this.dataDir, uuid)) return;
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error("Live HLS remux stopped before ready");
      }
      if (session.proc.killed || session.proc.exitCode != null) {
        throw new Error(
          `Live HLS remux failed: ${session.stderr.trim() || "ffmpeg exited"}`,
        );
      }
      await sleep(400);
    }
    throw Object.assign(new Error("Live HLS remux timed out waiting for segments"), {
      statusCode: 504,
    });
  }

  private stopSession(uuid: string): void {
    const session = this.sessions.get(uuid);
    if (!session) {
      rmSync(liveHlsDir(this.dataDir, uuid), { recursive: true, force: true });
      return;
    }
    this.sessions.delete(uuid);
    try {
      if (!session.proc.killed) session.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    try {
      session.lease.release();
    } catch {
      /* ignore */
    }
    rmSync(session.dir, { recursive: true, force: true });
  }

  private reapIdle(): void {
    const now = Date.now();
    for (const [uuid, session] of this.sessions) {
      if (now - session.lastAccess > IDLE_MS) {
        console.info(`[live-hls] reaping idle session ${uuid}`);
        this.stopSession(uuid);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
