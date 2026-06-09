"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisProvider = void 0;
const common_1 = require("../../../../libs/common/src");
const ioredis_1 = __importDefault(require("ioredis"));
exports.RedisProvider = {
    provide: 'REDIS_CLIENT',
    useFactory: async () => {
        return new ioredis_1.default({
            host: (0, common_1.getEnv)('REDIS_HOST', 'localhost'),
            port: (0, common_1.getEnvNumber)('REDIS_PORT', 6379),
            password: process.env.REDIS_PASSWORD || undefined,
        });
    },
};
//# sourceMappingURL=redis.provider.js.map