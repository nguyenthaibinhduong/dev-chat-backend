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
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const chat_service_1 = require("./chat.service");
let ChatController = class ChatController {
    constructor(chatService) {
        this.chatService = chatService;
    }
    async handleChatMessage(payload) {
        switch (payload.cmd) {
            case 'sendMessage':
                return await this.chatService.sendMessage(payload.data.user, payload.data, payload.data.presignedAttachments);
            case 'createChannel':
                return await this.chatService.createChannel(payload.data.user, payload.data);
            case 'searchMessagesByKeyword':
                return await this.chatService.searchMessagesByKeyword(payload.data.user.id, payload.data);
            case 'updateChannel':
                return await this.chatService.updateChannel(payload.data.user.id, payload.data.channel_id, payload.data);
            case 'listChannelsMessages':
                return await this.chatService.fetchHistory(payload.data.user, payload.data.channel_id, payload.data, payload.data.noAuth);
            case 'listChannelsByRepository':
                return await this.chatService.getChannelsByRepositoryIds(payload.data.user.id, payload.data);
            case 'listChannels':
                return await this.chatService.listChannels(payload.data.user);
            case 'searchChatEntities':
                return await this.chatService.searchChatEntities(payload.data.user, payload.data);
            case 'joinChannel':
                return await this.chatService.joinChannel(payload.data.user, payload.data);
            case 'addRepositoriesToChannel':
                return await this.chatService.addRepositoriesToChannel(payload.data.user.id, payload.data.channel_id, payload.data.repository_ids);
            case 'listRepositoriesByChannel':
                return await this.chatService.listRepositoriesByChannel(payload.data.user.id, payload.data.channel_id, payload.data);
            case 'removeRepositoriesFromChannel':
                return await this.chatService.removeRepositoryFromChannel(payload.data.user.id, payload.data.channel_id, payload.data.repository_id);
            case 'addMembersToChannel':
                return await this.chatService.addMembersToChannel(payload.data.user.id, payload.data.channel_id, payload.data.member_ids);
            case 'removeMembersFromChannel':
                return await this.chatService.removeMembersFromChannel(payload.data.user.id, payload.data.channel_id, payload.data.member_ids);
            case 'listNonMembers':
                return await this.chatService.listNonMembers(payload.data.channel_id, payload.data.username, payload.data.limit, payload.data.cursor);
            case 'searchMessages':
                return await this.chatService.searchMessages(payload.data.userId, payload.data);
            case 'admin_channel_management':
                return await this.chatService.channelCRUD(payload.data.user.id, payload.data, payload.data.method);
            default:
                return { error: 'Unknown command' };
        }
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, microservices_1.MessagePattern)('svc.chat.exec'),
    __param(0, (0, microservices_1.Payload)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "handleChatMessage", null);
exports.ChatController = ChatController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map