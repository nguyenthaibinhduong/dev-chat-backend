"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KafkaService = void 0;
const common_1 = require("@nestjs/common");
const kafkajs_1 = require("kafkajs");
const socket_service_1 = require("../socket.service");
const common_2 = require("../../../../libs/common/src");
let KafkaService = class KafkaService {
    constructor(socket) {
        this.socket = socket;
        const kafka = new kafkajs_1.Kafka({
            clientId: 'gateway',
            brokers: (0, common_2.getKafkaBrokers)(),
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
                await this.socket.broadcastWebhook(data);
            },
        });
    }
    async publish(topic, payload) {
        await this.producer.send({
            topic,
            messages: [{ value: JSON.stringify(payload) }],
        });
    }
};
exports.KafkaService = KafkaService;
exports.KafkaService = KafkaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [socket_service_1.ChatSocketService])
], KafkaService);
//# sourceMappingURL=kafka.service.js.map