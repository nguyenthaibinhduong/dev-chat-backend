import { Provider } from '@nestjs/common';
import { getEnv, getEnvNumber } from '@myorg/common';
import Redis from 'ioredis';

export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: async () => {
    return new Redis({
      host: getEnv('REDIS_HOST', 'localhost'),
      port: getEnvNumber('REDIS_PORT', 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  },
};
