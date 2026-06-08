// kafka.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { ChatSocketService } from '../socket.service';
import { getKafkaBrokers } from '@myorg/common';

@Injectable()
export class KafkaService implements OnModuleInit {
  private producer: Producer;
  private consumer: Consumer;

  constructor(private readonly socket: ChatSocketService) {
    const kafka = new Kafka({
      clientId: 'gateway',
      brokers: getKafkaBrokers(),
    });
    this.producer = kafka.producer();
    this.consumer = kafka.consumer({ groupId: 'gateway-group' });
  }

  async onModuleInit() {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'github.webhooks', fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const valueStr = message.value ? message.value.toString() : '{}';
        const data = JSON.parse(valueStr);
        console.log('Received GitHub webhook:', data);
            
        await this.socket.broadcastWebhook(data); // gọi qua SocketService
      },
    });
  }

  async publish(topic: string, payload: any) {
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
  }
}
