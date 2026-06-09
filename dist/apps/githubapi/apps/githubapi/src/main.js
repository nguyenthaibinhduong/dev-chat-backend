"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const git_module_1 = require("./git.module");
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("../../../libs/common/src");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(git_module_1.GitModule, {
        transport: microservices_1.Transport.KAFKA,
        options: {
            client: {
                brokers: (0, common_1.getKafkaBrokers)(),
                clientId: 'git',
            },
            consumer: {
                groupId: 'git-consumer',
                sessionTimeout: 60000,
                heartbeatInterval: 3000,
                retry: { retries: 5 },
            },
        },
    });
    app.useGlobalInterceptors(new common_1.RpcResponseInterceptor());
    await app.listen();
    console.log(`🚀 Git microservice is running`);
}
bootstrap();
//# sourceMappingURL=main.js.map