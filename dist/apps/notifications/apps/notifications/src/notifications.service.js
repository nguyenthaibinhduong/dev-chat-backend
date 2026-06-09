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
var NotificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const schemas_1 = require("../../../libs/schemas/src");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../../../libs/entities/src");
const common_2 = require("../../../libs/common/src");
let NotificationService = NotificationService_1 = class NotificationService {
    constructor(notificationModel, channelRepository, userRepository) {
        this.notificationModel = notificationModel;
        this.channelRepository = channelRepository;
        this.userRepository = userRepository;
        this.logger = new common_1.Logger(NotificationService_1.name);
    }
    async getChannelMembers(channelId) {
        if (!channelId)
            return [];
        const channel = await this.channelRepository.findOne({
            where: { id: channelId },
            relations: ['users'],
        });
        return ((channel === null || channel === void 0 ? void 0 : channel.users) || []).map((u) => ({
            id: String(u.id),
            username: u.username,
            email: u.email,
        }));
    }
    async createNotification(data, type = 'message') {
        switch (type) {
            case 'message':
                return this.createMessageNotification(data);
            case 'github':
                return this.createGitHubNotification(data);
            case 'system':
                return this.createSystemNotification(data);
            default:
                throw new common_2.RpcCustomException(`Unsupported notification type: ${type}`);
        }
    }
    async createMessageNotification(data) {
        var _a, _b;
        const channelId = (_a = data === null || data === void 0 ? void 0 : data.channel) === null || _a === void 0 ? void 0 : _a.id;
        const senderId = (_b = data === null || data === void 0 ? void 0 : data.sender) === null || _b === void 0 ? void 0 : _b.id;
        console.log(`Creating message notification for channel ${channelId} excluding sender ${senderId}`, data);
        const members = (await this.getChannelMembers(channelId))
            .filter((m) => m.id !== String(senderId))
            .map((m) => m.id);
        const savedNotifications = [];
        for (const member of members) {
            const notification = new this.notificationModel({
                userId: member,
                type: 'message',
                data: data,
                read: false,
                createdAt: new Date(),
            });
            const savedNotification = await notification.save();
            savedNotifications.push(savedNotification);
        }
        return {
            notifications: savedNotifications,
        };
    }
    async createGitHubNotification(data) {
        var _a;
        try {
            const installationId = (data === null || data === void 0 ? void 0 : data.installationId) || ((_a = data === null || data === void 0 ? void 0 : data.installation) === null || _a === void 0 ? void 0 : _a.id) || (data === null || data === void 0 ? void 0 : data.github_installation_id);
            this.logger.log(`GitHub installationId: ${installationId}`);
            if (!installationId) {
                this.logger.warn('No installationId provided in GitHub payload, skipping notification creation');
                return { notifications: [] };
            }
            const user = await this.userRepository.findOneBy({
                github_installation_id: installationId,
            });
            this.logger.log(`User found for installation ${installationId}: ${user ? user.id : 'null'}`);
            if (!user) {
                this.logger.warn(`No user found for GitHub installation ${installationId}. Skipping notification creation.`);
                return { notifications: [] };
            }
            const savedNotifications = [];
            const notification = new this.notificationModel({
                userId: String(user.id),
                type: 'github',
                data: data,
                read: false,
                createdAt: new Date(),
            });
            const savedNotification = await notification.save();
            savedNotifications.push(savedNotification);
            return {
                notifications: savedNotifications,
            };
        }
        catch (err) {
            this.logger.error(`Error in createGitHubNotification: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            return { notifications: [] };
        }
    }
    async createSystemNotification(data) {
        try {
            const { memberIds, text, type = 'system', additionalData = {} } = data;
            if (!memberIds || memberIds.length === 0) {
                this.logger.warn('No memberIds provided for system notification');
                return { notifications: [] };
            }
            if (!text || text.trim() === '') {
                this.logger.warn('No text provided for system notification');
                return { notifications: [] };
            }
            const savedNotifications = [];
            for (const memberId of memberIds) {
                const notification = new this.notificationModel({
                    userId: String(memberId),
                    type: type,
                    data: {
                        text: text,
                        timestamp: new Date(),
                        ...additionalData,
                    },
                    read: false,
                    createdAt: new Date(),
                });
                const savedNotification = await notification.save();
                savedNotifications.push(savedNotification);
                this.logger.log(`Created system notification for user ${memberId}`);
            }
            this.logger.log(`Created ${savedNotifications.length} system notifications`);
            return {
                notifications: savedNotifications,
                count: savedNotifications.length,
            };
        }
        catch (err) {
            this.logger.error(`Error in createSystemNotification: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            return { notifications: [] };
        }
    }
    async getNotificationsForUser(userId, query = {}) {
        try {
            const filter = { userId };
            if (query.read !== undefined) {
                filter.read = query.read;
            }
            if (query.type !== undefined) {
                query.type === '' ? delete filter.type : (filter.type = query.type);
            }
            const page = query.page || 1;
            const limit = query.limit || 10;
            const skip = (page - 1) * limit;
            const [notifications, total] = await Promise.all([
                this.notificationModel
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .exec(),
                this.notificationModel.countDocuments(filter).exec(),
            ]);
            return { notifications, total };
        }
        catch (error) {
            this.logger.error(`Error getting notifications for user ${userId}: ${error.message}`, error.stack);
            throw error;
        }
    }
    async markAsRead(notificationId) {
        try {
            const notification = await this.notificationModel
                .findByIdAndUpdate(notificationId, { read: true }, { new: true })
                .exec();
            if (!notification) {
                throw new Error(`Notification with ID ${notificationId} not found`);
            }
            this.logger.log(`Marked notification ${notificationId} as read`);
            return notification;
        }
        catch (error) {
            this.logger.error(`Error marking notification ${notificationId} as read: ${error.message}`, error.stack);
            throw error;
        }
    }
    async markAllAsRead(userId) {
        try {
            const result = await this.notificationModel
                .updateMany({ userId, read: false }, { read: true })
                .exec();
            this.logger.log(`Marked ${result.modifiedCount} notifications as read for user ${userId}`);
            return result.modifiedCount;
        }
        catch (error) {
            this.logger.error(`Error marking all notifications as read for user ${userId}: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getNumberOfUnreadNotifications(userId) {
        try {
            const unreadCount = await this.notificationModel
                .countDocuments({
                userId: userId,
                read: false
            })
                .exec();
            this.logger.log(`User ${userId} has ${unreadCount} unread notifications`);
            return unreadCount;
        }
        catch (error) {
            this.logger.error(`Error getting unread notifications count for user ${userId}: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = NotificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(schemas_1.Notification.name)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.Channel)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        typeorm_2.Repository,
        typeorm_2.Repository])
], NotificationService);
//# sourceMappingURL=notifications.service.js.map