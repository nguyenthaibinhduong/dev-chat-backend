"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const gateway_module_1 = require("./gateway.module");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const common_2 = require("../../../libs/common/src");
const socket_io_adapter_1 = require("./adapter/socket-io.adapter");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const body_parser_1 = __importDefault(require("body-parser"));
function setupOAuthCallbackAliases(app) {
    const server = app.getHttpAdapter().getInstance();
    server.get('/auth/api/v1/google-oauth/callback', (req, res) => {
        const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(307, `/v1/api/auth/google-oauth/callback${query}`);
    });
}
function createCorsOptions() {
    return {
        origin: true,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
        credentials: true,
        optionsSuccessStatus: 204,
    };
}
function setupSwagger(app) {
    const config = new swagger_1.DocumentBuilder()
        .setTitle('DevChat API')
        .setDescription('HTTP gateway API for auth, chat, uploads, GitHub integration, and notifications.')
        .setVersion('1.0')
        .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    }, 'access-token')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config, {
        ignoreGlobalPrefix: false,
    });
    swagger_1.SwaggerModule.setup('v1/docs', app, document, {
        jsonDocumentUrl: '/v1/docs-json',
        swaggerOptions: {
            persistAuthorization: true,
        },
    });
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
    setupSwagger(app);
    setupOAuthCallbackAliases(app);
    app.use('/v1/api/github-app/webhook', body_parser_1.default.json({
        verify: (req, res, buf) => {
            req.rawBody = buf;
        },
    }));
    app.use(body_parser_1.default.json());
    app.useWebSocketAdapter(new socket_io_adapter_1.AuthenticatedSocketIoAdapter(app, corsOptions));
    const port = (0, common_2.getEnvNumber)('GATEWAY_PORT', 3088);
    await app.listen(port);
    console.log('🌐 CORS is open for all origins on HTTP API and Socket.IO');
    console.log(`🚀 Gateway running at http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map