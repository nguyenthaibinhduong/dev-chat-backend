"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const notifications_module_1 = require("./notifications.module");
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("../../../libs/common/src");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(notifications_module_1.NotificationModule, {
        transport: microservices_1.Transport.KAFKA,
        options: {
            client: {
                brokers: (0, common_1.getKafkaBrokers)(),
                clientId: 'notification',
            },
            consumer: {
                groupId: 'notification-consumer',
            },
        },
    });
    app.useGlobalInterceptors(new common_1.RpcResponseInterceptor());
    await app.listen();
    console.log(`🚀 Notification microservice is running`);
}
bootstrap();
//# sourceMappingURL=main.js.map