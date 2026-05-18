import type {
  ArcaAuthCredentials,
  ArcaWsaaSessionKey,
  ArcaWsaaSessionStore,
} from "../internal/types";

const CREDENTIAL_EXPIRY_SAFETY_MARGIN_MS = 60_000;

export function createMemoryWsaaSessionStore(): ArcaWsaaSessionStore {
  const sessions = new Map<string, ArcaAuthCredentials>();
  const locks = new Map<string, Promise<void>>();

  return {
    get(key) {
      const credentials = sessions.get(serializeWsaaSessionKey(key));
      if (!(credentials && isWsaaCredentialValid(credentials))) {
        return Promise.resolve(null);
      }

      return Promise.resolve({ ...credentials });
    },
    set(key, credentials) {
      sessions.set(serializeWsaaSessionKey(key), { ...credentials });
      return Promise.resolve();
    },
    delete(key) {
      sessions.delete(serializeWsaaSessionKey(key));
      return Promise.resolve();
    },
    async withLock(key, fn) {
      const lockKey = serializeWsaaSessionKey(key);
      const previous = locks.get(lockKey) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const queued = previous.catch(() => undefined).then(() => current);
      locks.set(lockKey, queued);

      await previous.catch(() => undefined);

      try {
        return await fn();
      } finally {
        release();
        if (locks.get(lockKey) === queued) {
          locks.delete(lockKey);
        }
      }
    },
  };
}

export function serializeWsaaSessionKey(key: ArcaWsaaSessionKey): string {
  return [key.environment, key.service, key.certificateFingerprint].join(":");
}

export function isWsaaCredentialValid(
  credentials: ArcaAuthCredentials
): boolean {
  return (
    new Date(credentials.expiresAt).getTime() - Date.now() >
    CREDENTIAL_EXPIRY_SAFETY_MARGIN_MS
  );
}
