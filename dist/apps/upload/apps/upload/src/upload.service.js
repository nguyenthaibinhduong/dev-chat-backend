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
exports.UploadService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../../../libs/entities/src");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let UploadService = class UploadService {
    constructor(attachmentRepo, userRepo, sheetRepo) {
        this.attachmentRepo = attachmentRepo;
        this.userRepo = userRepo;
        this.sheetRepo = sheetRepo;
        this.bucket = process.env.CF_BUCKET;
        this.publicURL = process.env.PUBLIC_URL || '';
        this.s3 = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: process.env.CF_ENDPOINT,
            credentials: {
                accessKeyId: process.env.CF_ACCESS_KEY,
                secretAccessKey: process.env.CF_SECRET_KEY,
            },
        });
        this.setupCORS();
    }
    async setupCORS() {
        try {
            const corsConfiguration = {
                CORSRules: [
                    {
                        AllowedHeaders: ['*'],
                        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                        AllowedOrigins: [
                            'http://localhost:8080',
                            'http://localhost:3088',
                            'https://thaibinhduong1802.id.vn',
                        ],
                        ExposeHeaders: ['ETag'],
                        MaxAgeSeconds: 3000,
                    },
                ],
            };
            const command = new client_s3_1.PutBucketCorsCommand({
                Bucket: this.bucket,
                CORSConfiguration: corsConfiguration,
            });
            await this.s3.send(command);
            console.log('CORS configuration updated successfully');
        }
        catch (error) {
            console.error('Failed to set CORS configuration:', error);
        }
    }
    async getPresignedUrl(filename, contentType, userId) {
        const key = `uploads/${userId}/${Date.now()}-${filename}`;
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, { expiresIn: 60 });
        const fileUrl = `${this.publicURL}/${key}`;
        return { uploadUrl, fileUrl, key };
    }
    async getObject(key) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, { expiresIn: 60 });
        return url;
    }
    async getAttachmentsByChannel(params) {
        const { channelId, limit = 20, cursor, filename, mimeType, senderId, startDate, endDate, } = params;
        const qb = this.attachmentRepo
            .createQueryBuilder('attachment')
            .leftJoinAndSelect('attachment.message', 'message')
            .leftJoinAndSelect('message.channel', 'channel')
            .leftJoin('message.sender', 'sender')
            .addSelect(['sender.id', 'sender.username', 'sender.email'])
            .where('channel.id = :channelId', { channelId })
            .orderBy('attachment.created_at', 'DESC')
            .addOrderBy('attachment.id', 'DESC')
            .limit(limit);
        if (cursor) {
            qb.andWhere('attachment.id < :cursor', { cursor });
        }
        if (filename) {
            qb.andWhere('attachment.filename ILIKE :filename', {
                filename: `%${filename}%`,
            });
        }
        if (mimeType) {
            qb.andWhere('attachment.mimeType ILIKE :mimeType', {
                mimeType: `%${mimeType}%`,
            });
        }
        if (senderId) {
            qb.andWhere('sender.id = :senderId', { senderId });
        }
        if (startDate) {
            qb.andWhere('attachment.created_at >= :startDate', { startDate });
        }
        if (endDate) {
            qb.andWhere('attachment.created_at <= :endDate', { endDate });
        }
        const attachments = await qb.getMany();
        const nextCursor = attachments.length === limit
            ? attachments[attachments.length - 1].id
            : null;
        return {
            attachments,
            nextCursor,
            hasMore: attachments.length === limit,
        };
    }
    async getAvatarPresignedUrl(userId, filename, contentType) {
        const key = `avatars/${userId}/${Date.now()}-${filename}`;
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            ACL: 'public-read',
        });
        const avatarUrl = `${this.publicURL}/${key}`;
        const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, { expiresIn: 3600 });
        if (key && userId) {
            this.userRepo.update(userId, { avatar: avatarUrl });
        }
        return { signedUrl, key };
    }
    async getSheetUrl(channelId) {
        try {
            let sheet = await this.sheetRepo.findOne({
                where: { channel: { id: channelId } },
            });
            if (!sheet) {
                const r2Key = `sheets/${channelId}/${Date.now()}-sheet.json`;
                const sheetUrl = `${this.publicURL}/${r2Key}`;
                sheet = this.sheetRepo.create({
                    channel: { id: channelId },
                    sheetKey: r2Key,
                    sheetUrl,
                });
                await this.sheetRepo.save(sheet);
            }
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: sheet.sheetKey,
                ContentType: 'application/json',
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, {
                expiresIn: 3600,
            });
            return {
                signedUrl,
                sheetUrl: sheet.sheetUrl,
            };
        }
        catch (err) {
            console.error('getSheetUrl error: ', err);
            throw new common_1.InternalServerErrorException('Could not generate sheet URL');
        }
    }
    async manageUserFiles(userId, method, data) {
        switch (method) {
            case 'list':
                return this.listUserFiles(userId, data);
            case 'search':
                return this.searchUserFiles(userId, data);
            case 'filter':
                return this.filterUserFiles(userId, data);
            case 'unlink':
                return this.unlinkFile(userId, data);
            case 'list-channels-with-files':
                return this.listChannelsWithFiles(userId, data);
            default:
                throw new Error(`Invalid method: ${method}`);
        }
    }
    async listUserFiles(userId, data) {
        const { limit = 50, cursor } = data;
        const qb = this.attachmentRepo
            .createQueryBuilder('attachment')
            .leftJoinAndSelect('attachment.message', 'message')
            .leftJoinAndSelect('message.channel', 'channel')
            .leftJoin('message.sender', 'sender')
            .addSelect(['sender.id', 'sender.username', 'sender.email'])
            .where('sender.id = :userId', { userId })
            .orderBy('attachment.created_at', 'DESC')
            .addOrderBy('attachment.id', 'DESC')
            .limit(limit);
        if (cursor) {
            qb.andWhere('attachment.id < :cursor', { cursor });
        }
        const attachments = await qb.getMany();
        const formattedFiles = attachments.map((att) => {
            var _a;
            return ({
                id: att.id,
                filename: att.filename,
                fileUrl: att.fileUrl,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
                key: att.key,
                created_at: att.created_at,
                channel: ((_a = att.message) === null || _a === void 0 ? void 0 : _a.channel)
                    ? {
                        id: att.message.channel.id,
                        name: att.message.channel.name,
                        type: att.message.channel.type,
                    }
                    : null,
                message: att.message
                    ? {
                        id: att.message.id,
                        text: att.message.text,
                        send_at: att.message.send_at,
                    }
                    : null,
            });
        });
        const nextCursor = attachments.length === limit
            ? attachments[attachments.length - 1].id
            : null;
        return {
            files: formattedFiles,
            total: formattedFiles.length,
            nextCursor,
            hasMore: attachments.length === limit,
        };
    }
    async searchUserFiles(userId, data) {
        const { filename, limit = 50, cursor } = data;
        if (!filename) {
            throw new Error('Filename is required for search');
        }
        const qb = this.attachmentRepo
            .createQueryBuilder('attachment')
            .leftJoinAndSelect('attachment.message', 'message')
            .leftJoinAndSelect('message.channel', 'channel')
            .leftJoin('message.sender', 'sender')
            .addSelect(['sender.id', 'sender.username', 'sender.email'])
            .where('sender.id = :userId', { userId })
            .andWhere('attachment.filename ILIKE :filename', {
            filename: `%${filename}%`,
        })
            .orderBy('attachment.created_at', 'DESC')
            .addOrderBy('attachment.id', 'DESC')
            .limit(limit);
        if (cursor) {
            qb.andWhere('attachment.id < :cursor', { cursor });
        }
        const attachments = await qb.getMany();
        const formattedFiles = attachments.map((att) => {
            var _a;
            return ({
                id: att.id,
                filename: att.filename,
                fileUrl: att.fileUrl,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
                key: att.key,
                created_at: att.created_at,
                channel: ((_a = att.message) === null || _a === void 0 ? void 0 : _a.channel)
                    ? {
                        id: att.message.channel.id,
                        name: att.message.channel.name,
                        type: att.message.channel.type,
                    }
                    : null,
                message: att.message
                    ? {
                        id: att.message.id,
                        text: att.message.text,
                        send_at: att.message.send_at,
                    }
                    : null,
            });
        });
        const nextCursor = attachments.length === limit
            ? attachments[attachments.length - 1].id
            : null;
        return {
            files: formattedFiles,
            total: formattedFiles.length,
            searchQuery: filename,
            nextCursor,
            hasMore: attachments.length === limit,
        };
    }
    async filterUserFiles(userId, data) {
        const { channelId, mimeType, minSize, maxSize, startDate, endDate, limit = 50, cursor, } = data;
        const whereCondition = {
            message: {
                sender: { id: userId },
            },
        };
        const allAttachments = await this.attachmentRepo.find({
            where: whereCondition,
            relations: ['message', 'message.channel', 'message.sender'],
            order: {
                created_at: 'DESC',
                id: 'DESC',
            },
        });
        let filteredAttachments = allAttachments.filter((att) => {
            var _a;
            if (cursor && att.id >= cursor) {
                return false;
            }
            if (channelId !== undefined && channelId !== null && channelId !== '') {
                if (!((_a = att.message) === null || _a === void 0 ? void 0 : _a.channel) || att.message.channel.id != channelId) {
                    return false;
                }
            }
            if (mimeType) {
                if (!att.mimeType || !att.mimeType.toLowerCase().includes(mimeType.toLowerCase())) {
                    return false;
                }
            }
            if (minSize !== undefined && att.fileSize !== undefined && att.fileSize < minSize) {
                return false;
            }
            if (maxSize !== undefined && att.fileSize !== undefined && att.fileSize > maxSize) {
                return false;
            }
            if (startDate && att.created_at < startDate) {
                return false;
            }
            if (endDate && att.created_at > endDate) {
                return false;
            }
            return true;
        });
        const attachments = filteredAttachments.slice(0, limit);
        const formattedFiles = attachments.map((att) => {
            var _a;
            return ({
                id: att.id,
                filename: att.filename,
                fileUrl: att.fileUrl,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
                key: att.key,
                created_at: att.created_at,
                channel: ((_a = att.message) === null || _a === void 0 ? void 0 : _a.channel)
                    ? {
                        id: att.message.channel.id,
                        name: att.message.channel.name,
                        type: att.message.channel.type,
                    }
                    : null,
                message: att.message
                    ? {
                        id: att.message.id,
                        text: att.message.text,
                        send_at: att.message.send_at,
                    }
                    : null,
            });
        });
        const nextCursor = attachments.length === limit
            ? attachments[attachments.length - 1].id
            : null;
        return {
            files: formattedFiles,
            total: formattedFiles.length,
            filters: {
                channelId,
                mimeType,
                minSize,
                maxSize,
                startDate,
                endDate,
            },
            nextCursor,
            hasMore: attachments.length === limit,
        };
    }
    async unlinkFile(userId, data) {
        const { attachmentId, messageId } = data;
        if (!attachmentId && !messageId) {
            throw new Error('Either attachmentId or messageId is required');
        }
        if (attachmentId) {
            const attachment = await this.attachmentRepo.findOne({
                where: { id: Number(attachmentId) },
                relations: ['message', 'message.sender'],
            });
            if (!attachment) {
                throw new Error(`Attachment ${attachmentId} not found`);
            }
            await this.attachmentRepo.remove(attachment);
            return {
                success: true,
                message: 'File unlinked successfully',
                unlinkedFile: {
                    id: attachment.id,
                    filename: attachment.filename,
                    key: attachment.key,
                },
            };
        }
        if (messageId) {
            const attachments = await this.attachmentRepo.find({
                where: { message: { id: Number(messageId) } },
                relations: ['message', 'message.sender'],
            });
            if (attachments.length === 0) {
                throw new Error(`No attachments found for message ${messageId}`);
            }
            const firstAttachment = attachments[0];
            if (String(firstAttachment.message.sender.id) !== String(userId)) {
                throw new Error('You do not have permission to unlink files from this message');
            }
            await this.attachmentRepo.remove(attachments);
            return {
                success: true,
                message: 'All files unlinked successfully',
                unlinkedFiles: attachments.map((att) => ({
                    id: att.id,
                    filename: att.filename,
                    key: att.key,
                })),
                count: attachments.length,
            };
        }
    }
    async listChannelsWithFiles(userId, data) {
        const { limit = 50, cursor } = data;
        const whereCondition = {
            message: {
                sender: { id: userId },
                channel: { id: cursor ? { $lt: cursor } : undefined },
            },
        };
        if (!cursor) {
            delete whereCondition.message.channel.id;
        }
        const attachments = await this.attachmentRepo.find({
            where: {
                message: {
                    sender: { id: userId },
                },
            },
            relations: ['message', 'message.channel', 'message.sender'],
            order: {
                created_at: 'DESC',
            },
        });
        const validAttachments = attachments.filter((att) => { var _a, _b; return (_b = (_a = att.message) === null || _a === void 0 ? void 0 : _a.channel) === null || _b === void 0 ? void 0 : _b.id; });
        const channelMap = new Map();
        for (const att of validAttachments) {
            const channelId = Number(att.message.channel.id);
            if (channelMap.has(channelId)) {
                const existing = channelMap.get(channelId);
                existing.fileCount += 1;
                if (att.created_at > existing.lastFileDate) {
                    existing.lastFileDate = att.created_at;
                }
            }
            else {
                channelMap.set(channelId, {
                    channelId: att.message.channel.id,
                    channelName: att.message.channel.name,
                    channelType: att.message.channel.type,
                    fileCount: 1,
                    lastFileDate: att.created_at,
                });
            }
        }
        let channels = Array.from(channelMap.values()).sort((a, b) => b.lastFileDate.getTime() - a.lastFileDate.getTime());
        if (cursor) {
            const cursorNum = Number(cursor);
            channels = channels.filter((ch) => Number(ch.channelId) < cursorNum);
        }
        channels = channels.slice(0, limit);
        const nextCursor = channels.length === limit
            ? channels[channels.length - 1].channelId
            : null;
        return {
            channels,
            total: channels.length,
            nextCursor,
            hasMore: channels.length === limit,
        };
    }
};
exports.UploadService = UploadService;
exports.UploadService = UploadService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Attachment)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.Sheet)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], UploadService);
//# sourceMappingURL=upload.service.js.map