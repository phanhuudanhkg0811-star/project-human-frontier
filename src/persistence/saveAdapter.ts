import { canonicalStringify } from '../domain/canonicalJson.ts';
import { validateStateInvariants } from '../domain/invariants.ts';
import { sha256Hex } from '../domain/prng.ts';
import { validateSaveEnvelopeStructure } from '../schemas/contracts.ts';
import type { ContentBundle, DomainError, GameState, SaveEnvelope } from '../types/index.ts';

export const SAVE_STORAGE_KEY = 'human-frontier:moon32:save-v1';
export const APP_VERSION = '1.1.0';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export type SaveEnvelopeUnsigned = Omit<SaveEnvelope, 'checksum'>;

export function computeStateChecksum(state: GameState): string {
  return sha256Hex(canonicalStringify(state));
}

export function computeEnvelopeChecksum(envelope: SaveEnvelopeUnsigned | SaveEnvelope): string {
  const payload: SaveEnvelopeUnsigned = {
    schemaVersion: envelope.schemaVersion,
    savedAt: envelope.savedAt,
    appVersion: envelope.appVersion,
    contentVersion: envelope.contentVersion,
    modelVersion: envelope.modelVersion,
    catalogVersion: envelope.catalogVersion,
    state: envelope.state,
  };
  return sha256Hex(canonicalStringify(payload));
}

export function buildSaveEnvelope(state: GameState, nowIso = new Date().toISOString()): SaveEnvelope {
  const unsigned: SaveEnvelopeUnsigned = {
    schemaVersion: 1,
    savedAt: nowIso,
    appVersion: APP_VERSION,
    contentVersion: state.contentVersion,
    modelVersion: state.modelVersion,
    catalogVersion: state.catalogVersion,
    state,
  };
  return {
    ...unsigned,
    checksum: computeEnvelopeChecksum(unsigned),
  };
}

export type SaveWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: DomainError };

export type LoadSaveResult =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly state: GameState; readonly envelope: SaveEnvelope }
  | { readonly status: 'error'; readonly error: DomainError };

export function saveGameState(
  state: GameState,
  storage: StorageLike | null = getDefaultStorage(),
  nowIso?: string
): SaveWriteResult {
  if (!storage) {
    return {
      ok: false,
      error: {
        code: 'E_SAVE_CORRUPTED',
        message: 'Trình duyệt hiện không hỗ trợ bộ nhớ lưu cục bộ (localStorage).',
        recoverable: true,
      },
    };
  }
  try {
    const envelope = buildSaveEnvelope(state, nowIso);
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(envelope));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'E_SAVE_CORRUPTED',
        message: `Không thể ghi Save xuống bộ nhớ cục bộ: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      },
    };
  }
}

export function loadGameState(
  bundle: ContentBundle,
  storage: StorageLike | null = getDefaultStorage()
): LoadSaveResult {
  if (!storage) return { status: 'empty' };
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (!raw) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'error',
      error: {
        code: 'E_SAVE_CORRUPTED',
        message: 'File lưu (Save JSON) bị hỏng và không thể đọc.',
        recoverable: true,
      },
    };
  }

  let envelope: SaveEnvelope;
  try {
    envelope = validateSaveEnvelopeStructure(parsed);
  } catch (err) {
    return {
      status: 'error',
      error: {
        code: 'E_CONTRACT_MISMATCH',
        message: err instanceof Error ? err.message : 'Cấu trúc file lưu không hợp lệ.',
        recoverable: true,
      },
    };
  }

  const expectedChecksum = computeEnvelopeChecksum(envelope);
  if (envelope.checksum !== expectedChecksum) {
    return {
      status: 'error',
      error: {
        code: 'E_SAVE_CORRUPTED',
        message: 'Checksum file lưu (envelope + state) không khớp — dữ liệu có thể đã bị chỉnh sửa.',
        recoverable: true,
      },
    };
  }

  if (envelope.appVersion !== APP_VERSION) {
    return {
      status: 'error',
      error: {
        code: 'E_CONTRACT_MISMATCH',
        message: `Phiên bản ứng dụng không khớp (Save: ${envelope.appVersion}, App: ${APP_VERSION}).`,
        recoverable: true,
      },
    };
  }

  if (
    envelope.contentVersion !== bundle.balance.contentVersion ||
    envelope.state.contentVersion !== envelope.contentVersion
  ) {
    return {
      status: 'error',
      error: {
        code: 'E_CONTRACT_MISMATCH',
        message: `Phiên bản content không khớp (Save: ${envelope.contentVersion}, State: ${envelope.state.contentVersion}, App: ${bundle.balance.contentVersion}).`,
        recoverable: true,
      },
    };
  }

  if (
    envelope.modelVersion !== bundle.balance.modelVersion ||
    envelope.state.modelVersion !== envelope.modelVersion
  ) {
    return {
      status: 'error',
      error: {
        code: 'E_MODEL_MISMATCH',
        message: `Phiên bản simulation không khớp (Save: ${envelope.modelVersion}, State: ${envelope.state.modelVersion}, App: ${bundle.balance.modelVersion}).`,
        recoverable: true,
      },
    };
  }

  if (
    envelope.catalogVersion !== bundle.catalog.catalogVersion ||
    envelope.state.catalogVersion !== envelope.catalogVersion
  ) {
    return {
      status: 'error',
      error: {
        code: 'E_CATALOG_MISMATCH',
        message: `Phiên bản dữ liệu NASA không khớp (Save: ${envelope.catalogVersion}, State: ${envelope.state.catalogVersion}, App: ${bundle.catalog.catalogVersion}).`,
        recoverable: true,
      },
    };
  }

  const invErr = validateStateInvariants(envelope.state, bundle);
  if (invErr) {
    return { status: 'error', error: { ...invErr, recoverable: true } };
  }

  return { status: 'ok', state: envelope.state, envelope };
}

export function clearSavedGame(storage: StorageLike | null = getDefaultStorage()): void {
  try {
    storage?.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage denial errors when clearing
  }
}
