"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const chat_module_1 = require("./chat.module");
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("../../../libs/common/src");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(chat_module_1.ChatModule, {
        transport: microservices_1.Transport.KAFKA,
        options: {
            client: {
                brokers: (0, common_1.getKafkaBrokers)(),
                clientId: 'chat',
            },
            consumer: {
                groupId: 'chat-consumer',
            },
        },
    });
    app.useGlobalInterceptors(new common_1.RpcResponseInterceptor());
    await app.listen();
    console.log(`🚀 Chat microservice is running`);
}
bootstrap();
//# sourceMappingURL=main.js.map