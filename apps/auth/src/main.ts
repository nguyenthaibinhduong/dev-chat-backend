import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';
import { getKafkaBrokers, RpcResponseInterceptor } from '@myorg/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: getKafkaBrokers(),
        clientId: 'auth',
      },
      consumer: {
        groupId: 'auth-consumer',
      },
    },
  });
  app.useGlobalInterceptors(new RpcResponseInterceptor());
  await app.listen();
  console.log(`🚀 Auth microservice is running`);
}
bootstrap();
