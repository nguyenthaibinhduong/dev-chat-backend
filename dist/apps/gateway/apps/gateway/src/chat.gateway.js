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
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_service_1 = require("./socket.service");
let ChatGateway = class ChatGateway {
    constructor(chatSocketService) {
        this.chatSocketService = chatSocketService;
    }
    afterInit(server) {
        this.chatSocketService.setServer(server);
    }
    async handleConnection(client) {
        var _a, _b, _c;
        const userId = ((_a = client.user) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = client.data) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id);
        if (userId) {
            await this.chatSocketService.markUserOnline(userId, client.id);
            const unreadMap = await this.chatSocketService.getUnreadMap(userId);
            Object.entries(unreadMap).forEach(([channelId, count]) => {
                client.emit('unreadCount', { channelId, count });
            });
        }
        else {
            console.log(`🟢 Socket connected: ${client.id}`);
        }
    }
    async handleDisconnect(client) {
        var _a, _b, _c;
        const userId = ((_a = client.user) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = client.data) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id);
        if (userId) {
            await this.chatSocketService.markUserOffline(userId);
        }
        else {
            console.log(`🔴 Socket disconnected: ${client.id}`);
        }
    }
    async handleRegisterUnreadChannels(data, client) {
        await this.chatSocketService.registerUnreadChannels(client.id, data.channelIds || []);
        console.log(`🔔 Socket ${client.id} đăng ký nhận unread cho kênh:`, data.channelIds);
    }
    async handleJoinChannel(data, client) {
        await this.chatSocketService.joinChannel(client, data.channelId);
    }
    async handleCreateChannel(data, client) {
        const message = { user: client === null || client === void 0 ? void 0 : client.user, ...data };
        await this.chatSocketService.createChannel(message);
    }
    async handleUpdateChannel(data, client) {
        const message = { user: client === null || client === void 0 ? void 0 : client.user, ...data };
        console.log(`🔄 Update channel:`, message);
        await this.chatSocketService.updateChannel(message);
    }
    handleLeaveChannel(data, client) {
        this.chatSocketService.leaveChannel(client, data.channelId);
    }
    async handleSwitchChannel(data, client) {
        await this.chatSocketService.switchChannel(client, data.oldChannelId, data.newChannelId);
    }
    async handleSendMessage(data, client) {
        const message = { user: client === null || client === void 0 ? void 0 : client.user, ...data };
        console.log(`📩 Data message in channel ${message.channelId}:`, message);
        await this.chatSocketService.sendMessageToChannel(message);
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.SubscribeMessage)('register_unread_channels'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleRegisterUnreadChannels", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_channel'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleJoinChannel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('create_channel'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleCreateChannel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('update_channel'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleUpdateChannel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave_channel'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleLeaveChannel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('switch_channel'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSwitchChannel", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('send_message'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSendMessage", null);
exports.ChatGateway = ChatGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: true }),
    __metadata("design:paramtypes", [socket_service_1.ChatSocketService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map