export function getEnv(name: string, fallback?: string): string {
  return process.env[name] ?? fallback ?? '';
}

export function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) ? value : fallback;
}

export function getKafkaBrokers(): string[] {
  const raw = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'localhost:29092';
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}

