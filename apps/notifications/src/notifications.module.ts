import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NotificationController } from './notifications.controller';
import { NotificationService } from './notifications.service';
import { MongooseModule } from '@nestjs/mongoose';
import {  ConfigService } from '@nestjs/config';
import { Notification, NotificationSchema } from '@myorg/schemas';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, User } from '@myorg/entities';
import { DatabaseModule } from '@myorg/database';
import { getKafkaBrokers } from '@myorg/common';

const getMongoUri = (configService: ConfigService): string => {
  const uri = configService.get<string>('MONGODB_URI');
  if (uri) return uri;

  const username = encodeURIComponent(
    configService.get<string>('MONGO_INITDB_ROOT_USERNAME') || 'admin',
  );
  const password = encodeURIComponent(
    configService.get<string>('MONGO_INITDB_ROOT_PASSWORD') || 'password',
  );
  const database =
    configService.get<string>('MONGO_INITDB_DATABASE') || 'dev_chat';

  return `mongodb://${username}:${password}@mongodb:27017/${database}?authSource=admin`;
};

@Module({
  imports: [

    ClientsModule.register([
      {
        name: 'NOTIF_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            brokers: getKafkaBrokers(),
          },
          consumer: {
            groupId: 'notification-consumer',
          },
        },
      },
    ]),
    DatabaseModule,
    TypeOrmModule.forFeature([Channel,User]),

    //Mongodb connection
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: getMongoUri(configService),
      }),
    }),

    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
