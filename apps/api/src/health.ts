/**
 * Foundation-only health check. This proves the toolchain (TS strict + Vitest + CI) works
 * end to end. The real API (NestJS) is built in the "walking skeleton" card (#4); the
 * tenant-context wrapper — the most important code in the product — is card #2/#2.1.
 */
export type HealthStatus = {
  status: 'ok';
  service: 'onestack-api';
};

export function health(): HealthStatus {
  return { status: 'ok', service: 'onestack-api' };
}
