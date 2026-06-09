import type { TileType } from "../calculation_params";

export interface CalculateArgs {
  tileType: TileType;
  nt1: number;
  nt2: number;
  nt3: number;
  p1: number;
  p2: number;
  p3: number;
  g1: number;
  g2: number;
}

export interface CalculatePayload {
  filename: string;
  // /** base64-encoded STL file bytes (ASCII or binary) */
  // stl_text_b64: string;
  /** true when the original file was a binary STL */
  binary?: boolean;
  /** performance.now() value captured just before emit, for round-trip timing */
  client_ts: number;
  args: CalculateArgs;
}

// ─── calculate_tile event ────────────────────────────────────────────────────

export interface CalculateTilePayload {
  type: TileType;
  /** [p1, p2, p3] — tile shape parameters */
  values: [number, number, number];
}

// ─── result event (server → client) ──────────────────────────────────────────
//
// calculate_tile  → one TileSTLResult  (kind: 'tile_stl')
// calculate       → one ModelSTLResult (kind: 'model_stl', carries STL + download_token)

export interface Timings {
  /** null when client_ts was not provided in the request */
  client_to_server_ms: number | null;
  time_processed_ms: number;
  time_compress_ms: number;
  time_parsed_ms: number;
  overall_ms: number;
}

/** Emitted by calculate_tile — tile preview geometry only. */
export interface TileSTLResult {
  kind: 'tile_stl';
  filename: string;
  /** base64( gzip( ASCII-STL ) ) */
  stl_gz_b64: string;
  timings: Timings;
}

/** Emitted by calculate — full lattice result with download token. */
export interface ModelSTLResult {
  kind: 'model_stl';
  filename: string;
  /** base64( gzip( ASCII-STL ) ) */
  stl_gz_b64: string;
  download_token: string;
  timings: Timings;
  args_echo?: CalculateArgs;
}

export type ResultPayload = TileSTLResult | ModelSTLResult;

// ─── error event (server → client) ───────────────────────────────────────────
//
// The server uses two inconsistent shapes; ErrorPayload normalises them.

export interface ErrorPayload {
  /** normalised message (from either `msg` or `message` field) */
  message: string;
}

// ─── update event (server → client) ─────────────────────────────────────────

export type UpdatePayload =
  | { type: 'progress_start';  message: string }
  | { type: 'progress_update'; progress: number }
  | { type: 'progress_end';    progress: 100 };

// ─── log events (server → client) ────────────────────────────────────────────

export interface LogLine {
  data: string;
}

// ─── HTTP download ────────────────────────────────────────────────────────────

export interface DownloadRequest {
  token: string;
  file_type: 'stl' | 'igs';
}

// ─── Client-side validation ───────────────────────────────────────────────────

/**
 * A validation error raised by a UI component that blocks the calculate action.
 * Components report errors via onValidationChange(source, errors).
 * ToolPage aggregates by source key and blocks calculate when any errors exist.
 */
export interface ValidationError {
  message: string;
}


