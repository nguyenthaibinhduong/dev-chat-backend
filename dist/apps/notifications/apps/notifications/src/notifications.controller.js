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
exports.NotificationController = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const notifications_service_1 = require("./notifications.service");
let NotificationController = class NotificationController {
    constructor(notificationService) {
        this.notificationService = notificationService;
    }
    async handle(message) {
        const { cmd, data } = message || {};
        switch (cmd) {
            case 'send_notification':
                return this.notificationService.createNotification(data.data, data.type);
            case 'get_notifications':
                return this.notificationService.getNotificationsForUser(data.userId, data.query);
            case 'get_number_unread_notifications':
                return this.notificationService.getNumberOfUnreadNotifications(data.userId);
            case 'mark_as_read':
                return this.notificationService.markAsRead(data.notificationId);
            case 'mark_all_as_read':
                return this.notificationService.markAllAsRead(data.userId);
            default:
                return { ok: false, error: `Unknown cmd: ${cmd}` };
        }
    }
};
exports.NotificationController = NotificationController;
__decorate([
    (0, microservices_1.MessagePattern)('svc.notification.exec'),
    __param(0, (0, microservices_1.Payload)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "handle", null);
exports.NotificationController = NotificationController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [notifications_service_1.NotificationService])
], NotificationController);
//# sourceMappingURL=notifications.controller.js.map