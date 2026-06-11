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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const auth_service_1 = require("./auth.service");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async handle(message) {
        const { cmd, data } = message || {};
        switch (cmd) {
            case 'login':
                return this.authService.login(data);
            case 'register':
                return this.authService.register(data, data === null || data === void 0 ? void 0 : data.frontendUrl);
            case 'verify_token':
                return this.authService.validateToken(data.token);
            case 'refresh':
                return this.authService.refreshToken(data.refresh_token);
            case 'get_profile':
                return this.authService.getProfile(data.userId);
            case 'update_profile':
                return this.authService.updateProfile(data.user.id, data);
            case 'searchUsers':
                return this.authService.searchUsers(data.user, data.data);
            case 'confirm_email':
                return this.authService.confirmEmail(data.token);
            case 'get_token_info':
                return this.authService.getTokenUserData(data.userId);
            case 'verify_github_webhook':
                console.log('Verifying github webhook signature:', data);
                return this.authService.verifyWebhookSignature(data.signature, data.rawBody);
            case 'update_password':
                return this.authService.updatePassword(data.user.id, data.oldPassword, data.newPassword);
            case 'reset_password':
                return this.authService.resetPassword(data.email, data.otp, data.frontendUrl);
            case 'admin_user_management':
                return this.authService.CRUD(data.user.id, data, data.method);
            default:
                return { ok: false, error: `Unknown cmd: ${cmd}` };
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, microservices_1.MessagePattern)('svc.auth.exec'),
    __param(0, (0, microservices_1.Payload)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "handle", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map