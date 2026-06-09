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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayService = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const ioredis_1 = __importDefault(require("ioredis"));
const rxjs_1 = require("rxjs");
const crypto = __importStar(require("crypto"));
let GatewayService = class GatewayService {
    constructor(redis, kafka, topics) {
        this.redis = redis;
        this.kafka = kafka;
        this.topics = topics;
        this.algorithm = 'aes-256-cbc';
        const key = process.env.ID_ENCRYPTION_KEY || 'default-secret-key-32-chars-min';
        this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
    }
    async onModuleInit() {
        this.topics.forEach((t) => this.kafka.subscribeToResponseOf(t));
        await this.kafka.connect();
    }
    encryptId(id) {
        try {
            const text = String(id);
            const iv = crypto
                .createHash('md5')
                .update(text + process.env.ID_ENCRYPTION_KEY)
                .digest();
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const combined = iv.toString('hex') + ':' + encrypted;
            return 'ENC:' + Buffer.from(combined).toString('base64');
        }
        catch (err) {
            console.error('❌ Encrypt ID error:', err);
            return String(id);
        }
    }
    decryptId(encryptedId) {
        try {
            if (!encryptedId || !encryptedId.startsWith('ENC:')) {
                return encryptedId;
            }
            const base64Data = encryptedId.substring(4);
            const combined = Buffer.from(base64Data, 'base64').toString('utf8');
            const parts = combined.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted format');
            }
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (err) {
            console.error('❌ Decrypt ID error:', err);
            throw new common_1.HttpException({ code: 'INVALID_ENCRYPTED_ID', msg: 'ID không hợp lệ hoặc đã bị thay đổi' }, 400);
        }
    }
    decryptIdsInData(data) {
        if (data === null || data === undefined) {
            return data;
        }
        if (Array.isArray(data)) {
            return data.map(item => {
                if (typeof item === 'string' && item.startsWith('ENC:')) {
                    return this.decryptId(item);
                }
                return this.decryptIdsInData(item);
            });
        }
        if (typeof data === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(data)) {
                if (/json_?data/i.test(key) && typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value);
                        const decrypted = this.decryptIdsInData(parsed);
                        result[key] = JSON.stringify(decrypted);
                    }
                    catch {
                        result[key] = value;
                    }
                }
                else if (typeof value === 'string' && value.startsWith('ENC:')) {
                    result[key] = this.decryptId(value);
                }
                else if (typeof value === 'object') {
                    result[key] = this.decryptIdsInData(value);
                }
                else {
                    result[key] = value;
                }
            }
            return result;
        }
        return data;
    }
    encryptIdsInData(data) {
        if (data === null || data === undefined) {
            return data;
        }
        if (Array.isArray(data)) {
            return data.map(item => this.encryptIdsInData(item));
        }
        if (typeof data === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(data)) {
                if (/json_?data/i.test(key) && typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value);
                        const encrypted = this.encryptIdsInData(parsed);
                        result[key] = JSON.stringify(encrypted);
                    }
                    catch {
                        result[key] = value;
                    }
                }
                else if (['assignees', 'relatedMessages', 'relatedmessages'].includes(key.toLowerCase())) {
                    if (Array.isArray(value)) {
                        result[key] = value.map(item => {
                            if (typeof item === 'string' || typeof item === 'number') {
                                return this.encryptId(item);
                            }
                            return this.encryptIdsInData(item);
                        });
                    }
                    else {
                        result[key] = value;
                    }
                }
                else if (/id/i.test(key) && (typeof value === 'string' || typeof value === 'number')) {
                    result[key] = this.encryptId(value);
                }
                else if (typeof value === 'object') {
                    result[key] = this.encryptIdsInData(value);
                }
                else {
                    result[key] = value;
                }
            }
            return result;
        }
        return data;
    }
    async exec(service, cmd, data, opts) {
        var _a, _b, _c, _d;
        const topic = `svc.${service}.exec`;
        const wait = (_a = opts === null || opts === void 0 ? void 0 : opts.waitMs) !== null && _a !== void 0 ? _a : 50000;
        const skipEncryption = (_b = opts === null || opts === void 0 ? void 0 : opts.skipEncryption) !== null && _b !== void 0 ? _b : false;
        try {
            const decryptedData = skipEncryption ? data : this.decryptIdsInData(data);
            const res$ = this.kafka
                .send(topic, { cmd, data: decryptedData })
                .pipe((0, rxjs_1.timeout)(wait));
            const result = await (0, rxjs_1.lastValueFrom)(res$);
            if (!skipEncryption) {
                const encryptedResult = this.encryptIdsInData(result);
                return encryptedResult;
            }
            return result;
        }
        catch (err) {
            const payload = (_d = (_c = err === null || err === void 0 ? void 0 : err.response) !== null && _c !== void 0 ? _c : err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : err;
            if (payload === null || payload === void 0 ? void 0 : payload.status) {
                throw new common_1.HttpException({
                    code: payload.status,
                    msg: payload.msg,
                    data: null,
                }, payload.status);
            }
            if ((err === null || err === void 0 ? void 0 : err.name) === 'TimeoutError') {
                throw new common_1.HttpException({
                    code: 'REQUEST_TIMEOUT',
                    msg: `Service ${service} không phản hồi trong ${wait}ms`,
                }, 504);
            }
            throw new common_1.HttpException({ code: 'UNEXPECTED_ERROR', msg: JSON.stringify(payload) }, 500);
        }
    }
    async getAllOnlineUsers() {
        const all = await this.redis.hgetall("user_status");
        const onlineUsers = [];
        for (const [uid, data] of Object.entries(all)) {
            try {
                const status = JSON.parse(data);
                if (status.online) {
                    onlineUsers.push(uid);
                }
            }
            catch (err) {
                console.error("❌ Parse user_status lỗi", uid, err);
            }
        }
        const encryptedUsers = onlineUsers.map(uid => this.encryptId(uid));
        return {
            code: 200,
            msg: 'OK',
            data: encryptedUsers,
        };
    }
    emit(service, cmd, data) {
        const topic = `svc.${service}.exec`;
        const decryptedData = this.decryptIdsInData(data);
        return this.kafka.emit(topic, { cmd, data: decryptedData });
    }
};
exports.GatewayService = GatewayService;
exports.GatewayService = GatewayService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __param(1, (0, common_1.Inject)('KAFKA_GATEWAY')),
    __param(2, (0, common_1.Inject)('GATEWAY_TOPICS')),
    __metadata("design:paramtypes", [ioredis_1.default,
        microservices_1.ClientKafka, Array])
], GatewayService);
//# sourceMappingURL=gateway.service.js.map