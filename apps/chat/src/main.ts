import { NestFactory } from '@nestjs/core';
import { ChatModule } from './chat.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { getKafkaBrokers, RpcResponseInterceptor } from '@myorg/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ChatModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: getKafkaBrokers(),
        clientId: 'chat',
      },
      consumer: {
        groupId: 'chat-consumer',
      },
    },
  });

  app.useGlobalInterceptors(new RpcResponseInterceptor());
  await app.listen();
  console.log(`🚀 Chat microservice is running`);
}
bootstrap();
