"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayRpcExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
let GatewayRpcExceptionFilter = class GatewayRpcExceptionFilter {
    catch(exception, host) {
        var _a, _b, _c;
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        let error = exception.getError();
        if (typeof error === 'object' && error !== null) {
            return response.status((_a = error.status) !== null && _a !== void 0 ? _a : 400).json({
                status: (_b = error.status) !== null && _b !== void 0 ? _b : 400,
                msg: (_c = error.msg) !== null && _c !== void 0 ? _c : 'Rpc error',
                data: null,
            });
        }
        return response.status(400).json({
            status: 400,
            msg: error,
            data: null,
        });
    }
};
exports.GatewayRpcExceptionFilter = GatewayRpcExceptionFilter;
exports.GatewayRpcExceptionFilter = GatewayRpcExceptionFilter = __decorate([
    (0, common_1.Catch)(microservices_1.RpcException)
], GatewayRpcExceptionFilter);
//# sourceMappingURL=rpc-exception.filter.js.map