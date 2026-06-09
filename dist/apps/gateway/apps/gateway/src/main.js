"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const gateway_module_1 = require("./gateway.module");
const common_1 = require("@nestjs/common");
const common_2 = require("../../../libs/common/src");
const socket_io_adapter_1 = require("./adapter/socket-io.adapter");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const body_parser_1 = __importDefault(require("body-parser"));
function getCorsOrigins() {
    return Array.from(new Set([process.env.CORS_ORIGINS, process.env.FE_URL]
        .flatMap((value) => (value !== null && value !== void 0 ? value : '').split(','))
        .map((origin) => origin.trim())
        .filter(Boolean)));
}
function createCorsOptions() {
    const allowedOrigins = getCorsOrigins();
    const allowLocalhost = process.env.NODE_ENV !== 'production';
    return {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
                callback(null, true);
                return;
            }
            const isAllowedLocalhost = allowLocalhost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
            callback(null, allowedOrigins.includes(origin) || isAllowedLocalhost);
        },
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
        credentials: true,
        optionsSuccessStatus: 204,
    };
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(gateway_module_1.AppModule, { bodyParser: false });
    const corsOptions = createCorsOptions();
    app.use((0, cookie_parser_1.default)());
    app.useGlobalFilters(new common_2.GatewayRpcExceptionFilter());
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.enableCors(corsOptions);
    app.use('/v1/api/github-app/webhook', body_parser_1.default.json({
        verify: (req, res, buf) => {
            req.rawBody = buf;
        },
    }));
    app.use(body_parser_1.default.json());
    app.useWebSocketAdapter(new socket_io_adapter_1.AuthenticatedSocketIoAdapter(app, corsOptions));
    const port = (0, common_2.getEnvNumber)('GATEWAY_PORT', 3088);
    await app.listen(port);
    console.log(`🚀 Gateway running at http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map