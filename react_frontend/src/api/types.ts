// ─── Shared enums ────────────────────────────────────────────────────────────

export type TileType = 'cross' | 'diagonal' | 'cross_diagonal';

// ─── calculate event ─────────────────────────────────────────────────────────

export interface CalculateArgs {
  tileType: TileType;
  nt1: number;
  nt2: number;
  nt3: number;
  g1: number;
  g2: number;
}

export interface CalculatePayload {
  filename: string;
  /** base64-encoded STL file bytes (ASCII or binary) */
  stl_text_b64?: any;
  igs_b64?: any;
  /** true when the original file was a binary STL */
  binary?: boolean;
  /** performance.now() value captured just before emit, for round-trip timing */
  client_ts: number;
  args: CalculateArgs;
}

export interface ConvertIGESToSTLPayload {
  filename: string;
  /** raw IGES text content */
  data: string;
}
// ─── calculate_tile event ────────────────────────────────────────────────────

export interface CalculateTilePayload {
  type: TileType;
  /** [p1, p2, p3] — tile shape parameters */
  values: [number, number, number];
}

// ─── result event (server → client) ──────────────────────────────────────────
//
// The server emits `result` twice after `calculate`:
//   1. STLResult  — carries the mesh (stl_gz_b64 is present)
//   2. TokenResult — carries the download token (stl_gz_b64 is absent)
//
// After `calculate_tile` it emits one STLResult (no token follow-up).

export interface Timings {
  client_to_server_ms: number | null;
  time_parsed_ms: number;
  time_processed_ms: number;
  time_compress_ms: number;
  overall_ms: number;
}

/** Shared properties for all calculation results */
interface BaseResult {
  filename: string;
  timings: Timings;
  args_echo?: any; // Replace 'any' with your CalculateArgs type
}

export interface TileSTLResult extends BaseResult {
  kind: 'tile_stl';
  /** base64( gzip( ASCII-STL ) ) — decompress with pako.ungzip */
  stl_gz_b64: string;
}

export interface ModelIGSResult extends BaseResult {
  kind: 'model_igs';
  /** base64( gzip( IGS content ) ) — decompress with pako.ungzip */
  igs_gz_b64: string;
  download_token: string;
}

/** Discriminated Union for result handling */
export type Result = TileSTLResult | ModelIGSResult;

// ─── error event (server → client) ───────────────────────────────────────────
//
// The server uses two inconsistent shapes; ErrorPayload normalises them.

export interface ErrorPayload {
  /** normalised message (from either `msg` or `message` field) */
  message: string;
}

// ─── log events (server → client) ────────────────────────────────────────────

export interface LogLine {
  data: string;
}

// ─── HTTP download ────────────────────────────────────────────────────────────

export interface DownloadRequest {
  token: string;
}

export type VIEWER_ORDER = "uploaded" | "tile_preview" | "result";