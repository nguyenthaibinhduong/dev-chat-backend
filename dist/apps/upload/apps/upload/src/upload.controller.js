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
exports.UploadController = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const upload_service_1 = require("./upload.service");
let UploadController = class UploadController {
    constructor(UploadService) {
        this.UploadService = UploadService;
    }
    async handleUploadMessage(payload) {
        switch (payload.cmd) {
            case 'getPresignedUrl':
                return await this.UploadService.getPresignedUrl(payload.data.filename, payload.data.contentType, payload.data.user.id);
            case 'getObject':
                return await this.UploadService.getObject(payload.data.key);
            case 'getAttachmentsByChannel':
                console.log('upload controller', payload.data);
                return await this.UploadService.getAttachmentsByChannel(payload.data);
            case 'getAvatarPresignedUrl':
                return await this.UploadService.getAvatarPresignedUrl(payload.data.userId, payload.data.filename, payload.data.contentType);
            case 'getSheetUrl':
                return await this.UploadService.getSheetUrl(payload.data.channelId);
            case 'admin_file_management':
                return await this.UploadService.manageUserFiles(payload.data.userId, payload.data.method, payload.data);
            default:
                return { error: 'Unknown command' };
        }
    }
};
exports.UploadController = UploadController;
__decorate([
    (0, microservices_1.MessagePattern)('svc.upload.exec'),
    __param(0, (0, microservices_1.Payload)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "handleUploadMessage", null);
exports.UploadController = UploadController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService])
], UploadController);
//# sourceMappingURL=upload.controller.js.map