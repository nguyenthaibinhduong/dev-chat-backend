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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../../../libs/entities/src");
const client_s3_1 = require("@aws-sdk/client-s3");
const crypto_1 = require("crypto");
let AttachmentService = class AttachmentService {
    constructor(attachmentRepo, messageRepo) {
        this.attachmentRepo = attachmentRepo;
        this.messageRepo = messageRepo;
        this.bucket = process.env.CF_BUCKET;
        this.s3 = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: process.env.CF_ENDPOINT,
            credentials: {
                accessKeyId: process.env.CF_ACCESS_KEY,
                secretAccessKey: process.env.CF_SECRET_KEY,
            },
        });
    }
    async uploadAndCreateAttachment(params) {
        const message = await this.messageRepo.findOne({
            where: { id: params.messageId },
        });
        if (!message)
            throw new Error('Message not found');
        const key = `uploads/${params.userId}/${Date.now()}-${(0, crypto_1.randomUUID)()}-${params.filename}`;
        await this.s3.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: params.buffer,
            ContentType: params.mimetype,
        }));
        const fileUrl = `${process.env.CDN_URL}/${key}`;
        const attachment = this.attachmentRepo.create({
            fileUrl: fileUrl,
            mimeType: params.type,
            filename: params.filename,
            message,
        });
        return await this.attachmentRepo.save(attachment);
    }
    async createAttachment(params) {
        const message = await this.messageRepo.findOne({
            where: { id: params.messageId },
        });
        if (!message)
            throw new Error('Message not found');
        const attachment = this.attachmentRepo.create({
            fileUrl: params.url,
            mimeType: params.type,
            filename: params.filename,
            message,
        });
        return await this.attachmentRepo.save(attachment);
    }
};
exports.AttachmentService = AttachmentService;
exports.AttachmentService = AttachmentService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Attachment)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.Message)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], AttachmentService);
//# sourceMappingURL=attachment.service.js.map