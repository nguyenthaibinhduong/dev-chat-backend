"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const upload_module_1 = require("./upload.module");
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("../../../libs/common/src");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(upload_module_1.UploadModule, {
        transport: microservices_1.Transport.KAFKA,
        options: {
            client: {
                brokers: (0, common_1.getKafkaBrokers)(),
                clientId: 'upload',
            },
            consumer: {
                groupId: 'upload-consumer',
            },
        },
    });
    app.useGlobalInterceptors(new common_1.RpcResponseInterceptor());
    await app.listen();
    console.log(`🚀 Upload microservice is running`);
}
bootstrap();
//# sourceMappingURL=main.js.map