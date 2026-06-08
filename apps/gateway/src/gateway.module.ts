import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { Partitioners } from 'kafkajs';
import * as redisStore from 'cache-manager-ioredis';
import { getEnv, getEnvNumber, getKafkaBrokers } from '@myorg/common';
import { ChatGateway } from './chat.gateway';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { KafkaService } from './kafka/kafka.service';
import { RedisProvider } from './redis/redis.provider';
import { ChatSocketService } from './socket.service';

const SERVICES = ['auth', 'chat', 'upload', 'git', 'notification'];
const TOPICS = SERVICES.map((service) => `svc.${service}.exec`);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '1h' },
    }),
    ClientsModule.register([
      {
        name: 'KAFKA_GATEWAY',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'gateway',
            brokers: getKafkaBrokers(),
          },
          consumer: { groupId: 'gateway-consumer' },
          producer: {
            createPartitioner: Partitioners.JavaCompatiblePartitioner,
          },
        },
      },
    ]),
    CacheModule.register({
      store: redisStore,
      host: getEnv('REDIS_HOST', 'localhost'),
      port: getEnvNumber('REDIS_PORT', 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      ttl: 20 * 1000,
    }),
  ],
  controllers: [GatewayController],
  providers: [
    GatewayService,
    ChatSocketService,
    KafkaService,
    ChatGateway,
    RedisProvider,
    { provide: 'GATEWAY_TOPICS', useValue: TOPICS },
  ],
})
export class AppModule {}
