import { io, Socket } from 'socket.io-client';
import type {
  CalculatePayload,
  CalculateTilePayload,
  Result,
  ErrorPayload,
  LogLine,
  TileSTLResult,
  ModelSTLResult,
  ConvertIGESToSTLPayload,
} from './types';

// ─── Raw server-emitted shapes (before normalisation) ────────────────────────

interface RawResult {
  filename?: string;
  stl_gz_b64?: string;
  kind?: string;
  timings?: ModelSTLResult['timings'];
  args_echo?: ModelSTLResult['args_echo'];
  download_token?: string;
}

interface RawError {
  msg?: string;
  message?: string;
}

// ─── Public callback types ────────────────────────────────────────────────────

type ResultHandler = (payload: Result) => void;
type ErrorHandler = (payload: ErrorPayload) => void;
type LogHandler = (line: LogLine) => void;
type ConnectHandler = () => void;
type DisconnectHandler = (reason: string) => void;

// ─── LatticeSocketClient ──────────────────────────────────────────────────────

export class LatticeSocketClient {
  private socket: Socket;

  constructor(serverUrl = 'http://localhost:5003') {
    this.socket = io(serverUrl);
    this.socket.on('result', this.handleRawResult.bind(this));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  disconnect(): void {
    this.socket.disconnect();
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  // ── Client → Server ───────────────────────────────────────────────────────

  calculate(payload: CalculatePayload): void {
    this.socket.emit('calculate', payload);
  }

  convertIGESToSTL(payload: ConvertIGESToSTLPayload): void {
    this.socket.emit('convert_igs_to_stl', payload);
  }

  calculateTile(payload: CalculateTilePayload): void {
    this.socket.emit('calculate_tile', payload);
  }

  // ── Server → Client ───────────────────────────────────────────────────────

  onConnect(handler: ConnectHandler): () => void {
    this.socket.on('connect', handler);
    return () => this.socket.off('connect', handler);
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.socket.on('disconnect', handler);
    return () => this.socket.off('disconnect', handler);
  }

  /**
   * Unified result handler — receives both STLResult and TokenResult.
   * Use the `kind` discriminant to branch:
   *   if (payload.kind === 'stl') { ... }
   *   if (payload.kind === 'token') { ... }
   */
  onResult(handler: ResultHandler): () => void {
    this.resultHandlers.add(handler);
    return () => this.resultHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    const wrapper = (raw: RawError) => {
      handler({ message: raw.msg ?? raw.message ?? 'Unknown server error' });
    };
    this.socket.on('error', wrapper);
    return () => this.socket.off('error', wrapper);
  }

  onLogUpdate(handler: LogHandler): () => void {
    this.socket.on('log_update', handler);
    return () => this.socket.off('log_update', handler);
  }

  onLogError(handler: LogHandler): () => void {
    this.socket.on('log_error', handler);
    return () => this.socket.off('log_error', handler);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private resultHandlers = new Set<ResultHandler>();

  private handleRawResult(raw: RawResult): void {
    console.log("Raw result: ", raw);
    const payload: Result = (raw.kind === 'tile_stl')
    ? {
      kind: 'tile_stl',
      filename: raw.filename ?? '',
      stl_gz_b64: raw.stl_gz_b64!,
      timings: raw.timings!,
      args_echo: raw.args_echo,
    } as TileSTLResult
    : {
      kind: (raw.kind ?? 'model_stl') as 'model_stl' | 'model_preview_stl',
      filename: raw.filename ?? '',
      stl_gz_b64: raw.stl_gz_b64!,
      timings: raw.timings!,
      args_echo: raw.args_echo,
      download_token: raw.download_token ?? '',
    } as ModelSTLResult;

    this.resultHandlers.forEach((h) => h(payload));
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: LatticeSocketClient | null = null;

export function getLatticeSocket(): LatticeSocketClient {
  if (!_client) _client = new LatticeSocketClient();
  return _client;
}