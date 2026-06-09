"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const microservices_1 = require("@nestjs/microservices");
const auth_module_1 = require("./auth.module");
const common_1 = require("../../../libs/common/src");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(auth_module_1.AuthModule, {
        transport: microservices_1.Transport.KAFKA,
        options: {
            client: {
                brokers: (0, common_1.getKafkaBrokers)(),
                clientId: 'auth',
            },
            consumer: {
                groupId: 'auth-consumer',
            },
        },
    });
    app.useGlobalInterceptors(new common_1.RpcResponseInterceptor());
    await app.listen();
    console.log(`🚀 Auth microservice is running`);
}
bootstrap();
//# sourceMappingURL=main.js.map