"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcResponseInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let RpcResponseInterceptor = class RpcResponseInterceptor {
    intercept(context, next) {
        if (context.getType() === 'rpc') {
            return next.handle().pipe((0, operators_1.map)((data) => ({
                status: 200,
                msg: 'success',
                data: data !== null && data !== void 0 ? data : null,
            })));
        }
        return next.handle();
    }
};
exports.RpcResponseInterceptor = RpcResponseInterceptor;
exports.RpcResponseInterceptor = RpcResponseInterceptor = __decorate([
    (0, common_1.Injectable)()
], RpcResponseInterceptor);
//# sourceMappingURL=rpc-response.interceptor.js.map