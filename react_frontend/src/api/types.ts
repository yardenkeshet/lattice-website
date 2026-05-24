// ─── Shared enums ────────────────────────────────────────────────────────────

export type TileType = 'cross' | 'diagonal' | 'cross_diagonal';

export type CalcMode = 'extrusion' | 'revolution' | 'ruling';

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
  stl_text_b64: string;
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
// The server emits `result` twice after `calculate`:
//   1. STLResult  — carries the mesh (stl_gz_b64 is present)
//   2. TokenResult — carries the download token (stl_gz_b64 is absent)
//
// After `calculate_tile` it emits one STLResult (no token follow-up).

export interface Timings {
  /** null when client_ts was not provided in the request */
  client_to_server_ms: number | null;
  time_processed_ms: number;
  time_compress_ms: number;
  time_parsed_ms: number;
  overall_ms: number;
}

export interface STLResult {
  kind: 'stl';
  filename: string;
  /** base64( gzip( ASCII-STL ) ) — decompress with pako.ungzip */
  stl_gz_b64: string;
  timings: Timings;
  /** echoed back from the calculate args */
  args_echo?: CalculateArgs;
}

export interface TokenResult {
  kind: 'token';
  filename: string;
  download_token: string;
}

export type ResultPayload = STLResult | TokenResult;

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

// ─── Client-side validation ───────────────────────────────────────────────────

/**
 * A validation error raised by a UI component that blocks the calculate action.
 * Components report errors via onValidationChange(source, errors).
 * ToolPage aggregates by source key and blocks calculate when any errors exist.
 */
export interface ValidationError {
  message: string;
}