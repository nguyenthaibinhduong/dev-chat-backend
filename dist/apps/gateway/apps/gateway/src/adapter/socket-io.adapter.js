"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticatedSocketIoAdapter = void 0;
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const common_1 = require("@nestjs/common");
const gateway_service_1 = require("../gateway.service");
const socket_service_1 = require("../socket.service");
class AuthenticatedSocketIoAdapter extends platform_socket_io_1.IoAdapter {
    constructor(app, corsOptions) {
        super(app);
        this.corsOptions = corsOptions;
        this.gatewayService = app.get(gateway_service_1.GatewayService);
        this.chatSocketService = app.get(socket_service_1.ChatSocketService);
    }
    createIOServer(port, options) {
        const server = super.createIOServer(port, {
            ...options,
            cors: this.corsOptions,
        });
        server.use(async (socket, next) => {
            var _a, _b, _c, _d;
            try {
                const token = ((_b = (_a = socket.handshake) === null || _a === void 0 ? void 0 : _a.auth) === null || _b === void 0 ? void 0 : _b.token) ||
                    ((_d = (_c = socket.handshake) === null || _c === void 0 ? void 0 : _c.headers['authorization']) === null || _d === void 0 ? void 0 : _d.replace('Bearer ', ''));
                if (!token) {
                    return next(new common_1.UnauthorizedException('No token provided'));
                }
                const data = await this.gatewayService.exec('auth', 'verify_token', { token });
                const dataDecript = this.gatewayService.decryptIdsInData(data);
                if (!(dataDecript === null || dataDecript === void 0 ? void 0 : dataDecript.data)) {
                    return next(new common_1.UnauthorizedException('Invalid token'));
                }
                socket.user = { id: dataDecript.data.id };
                next();
            }
            catch (err) {
                next(err);
            }
        });
        server.on('connection', async (socket) => {
            var _a;
            if ((_a = socket.user) === null || _a === void 0 ? void 0 : _a.id) {
                await this.chatSocketService.markUserOnline(socket.user.id, socket.id);
            }
            socket.on('disconnect', async () => {
                var _a;
                if ((_a = socket.user) === null || _a === void 0 ? void 0 : _a.id) {
                    await this.chatSocketService.markUserOffline(socket.user.id);
                }
            });
        });
        return server;
    }
}
exports.AuthenticatedSocketIoAdapter = AuthenticatedSocketIoAdapter;
//# sourceMappingURL=socket-io.adapter.js.map