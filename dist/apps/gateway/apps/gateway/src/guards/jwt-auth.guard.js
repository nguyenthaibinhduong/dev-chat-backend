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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const gateway_service_1 = require("../gateway.service");
let JwtAuthGuard = class JwtAuthGuard {
    constructor(gw) {
        this.gw = gw;
    }
    async canActivate(context) {
        var _a;
        const req = context.switchToHttp().getRequest();
        let token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', '');
        if (!token) {
            token = req.cookies['access_token'];
        }
        if (!token)
            throw new common_1.UnauthorizedException('No token provided');
        const data = await this.gw.exec('auth', 'verify_token', { token });
        const dataDecript = this.gw.decryptIdsInData(data);
        if (!(dataDecript === null || dataDecript === void 0 ? void 0 : dataDecript.data))
            return false;
        req.user = dataDecript === null || dataDecript === void 0 ? void 0 : dataDecript.data;
        return true;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [gateway_service_1.GatewayService])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map