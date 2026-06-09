"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcCustomException = void 0;
const microservices_1 = require("@nestjs/microservices");
class RpcCustomException extends microservices_1.RpcException {
    constructor(message, status = 400) {
        super({ message, status });
    }
}
exports.RpcCustomException = RpcCustomException;
//# sourceMappingURL=rpc-custom.exception.js.map