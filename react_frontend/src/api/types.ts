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
  p1: number;
  p2: number;
  p3: number;
}

export interface CalculatePayload {
  filename: string;
  igs_b64: string;           // required — base64-encoded IGS bytes
  binary?: boolean;          // true when the IGS file is binary (rare)
  client_ts?: number;        // performance.now() for round-trip timing
  args: CalculateArgs;
}

export interface ConvertIGESToSTLPayload {
  filename: string;
  data: string;              // raw IGES text content (not base64)
}

// ─── calculate_tile event ────────────────────────────────────────────────────

export interface CalculateTilePayload {
  type: TileType;
  values: [number, number, number];   // [p1, p2, p3]
}

// ─── result event (server → client) ──────────────────────────────────────────

export interface Timings {
  client_to_server_ms: number | null;
  time_dll_ms: number;        // replaces old time_parsed_ms + time_processed_ms
  time_compress_ms: number;
  overall_ms: number;
}

/** Shared properties — all optional because tile results omit most of them */
interface BaseResult {
  filename?: string;
  timings?: Partial<Timings>;
  args_echo?: CalculateArgs;
}

/** Emitted after calculate_tile */
export interface TileSTLResult extends BaseResult {
  kind: 'tile_stl';
  stl_gz_b64: string;         // base64( gzip( ASCII-STL ) )
}

// ─── error / warning events (server → client) ────────────────────────────────
//
// Backend uses two shapes inconsistently: { msg } and { message }.
// Backend also emits a 'warning' event (malformed IGS) with { msg, details }.

export interface ErrorPayload {
  message: string;            // normalise both `msg` and `message` in your handler
}

export interface WarningPayload {
  msg: string;
  details: string[];
}

// ─── log events (server → client) ────────────────────────────────────────────

export interface LogLine {
  data: string;
}

// ─── HTTP download ────────────────────────────────────────────────────────────

export interface DownloadRequest {
  token: string;
}

export type VIEWER_ORDER = 'uploaded' | 'tile_preview' | 'result';

/** Emitted after calculate (main lattice operation) */
export interface ModelSTLResult extends BaseResult {
  kind: 'model_stl';
  stl_gz_b64: string;
  filename_reduced: string;
  download_token: string;
}

/** Emitted after convert_igs_to_stl (upload preview) */
export interface ModelPreviewSTLResult extends BaseResult {
  kind: 'model_preview_stl';
  stl_gz_b64: string;
}

export type Result = ModelSTLResult | ModelPreviewSTLResult | TileSTLResult;