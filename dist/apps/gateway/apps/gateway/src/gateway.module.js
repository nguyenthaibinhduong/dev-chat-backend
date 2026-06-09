"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const cache_manager_1 = require("@nestjs/cache-manager");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const microservices_1 = require("@nestjs/microservices");
const jwt_1 = require("@nestjs/jwt");
const kafkajs_1 = require("kafkajs");
const redisStore = __importStar(require("cache-manager-ioredis"));
const common_2 = require("../../../libs/common/src");
const chat_gateway_1 = require("./chat.gateway");
const gateway_controller_1 = require("./gateway.controller");
const gateway_service_1 = require("./gateway.service");
const kafka_service_1 = require("./kafka/kafka.service");
const redis_provider_1 = require("./redis/redis.provider");
const socket_service_1 = require("./socket.service");
const SERVICES = ['auth', 'chat', 'upload', 'git', 'notification'];
const TOPICS = SERVICES.map((service) => `svc.${service}.exec`);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: `.env.${process.env.NODE_ENV}`,
            }),
            jwt_1.JwtModule.register({
                secret: process.env.JWT_SECRET || 'dev-secret',
                signOptions: { expiresIn: '1h' },
            }),
            microservices_1.ClientsModule.register([
                {
                    name: 'KAFKA_GATEWAY',
                    transport: microservices_1.Transport.KAFKA,
                    options: {
                        client: {
                            clientId: 'gateway',
                            brokers: (0, common_2.getKafkaBrokers)(),
                        },
                        consumer: { groupId: 'gateway-consumer' },
                        producer: {
                            createPartitioner: kafkajs_1.Partitioners.JavaCompatiblePartitioner,
                        },
                    },
                },
            ]),
            cache_manager_1.CacheModule.register({
                store: redisStore,
                host: (0, common_2.getEnv)('REDIS_HOST', 'localhost'),
                port: (0, common_2.getEnvNumber)('REDIS_PORT', 6379),
                password: process.env.REDIS_PASSWORD || undefined,
                ttl: 20 * 1000,
            }),
        ],
        controllers: [gateway_controller_1.GatewayController],
        providers: [
            gateway_service_1.GatewayService,
            socket_service_1.ChatSocketService,
            kafka_service_1.KafkaService,
            chat_gateway_1.ChatGateway,
            redis_provider_1.RedisProvider,
            { provide: 'GATEWAY_TOPICS', useValue: TOPICS },
        ],
    })
], AppModule);
//# sourceMappingURL=gateway.module.js.map