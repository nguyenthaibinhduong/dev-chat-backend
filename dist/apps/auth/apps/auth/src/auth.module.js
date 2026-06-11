"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const mailer_1 = require("@nestjs-modules/mailer");
const handlebars_adapter_1 = require("@nestjs-modules/mailer/dist/adapters/handlebars.adapter");
const common_2 = require("../../../libs/common/src");
const database_1 = require("../../../libs/database/src");
const entities_1 = require("../../../libs/entities/src");
const ioredis_1 = __importDefault(require("ioredis"));
const path_1 = __importDefault(require("path"));
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const user_repository_1 = require("./repositories/user.repository");
const github_strategy_1 = require("./strategies/github.strategy");
const google_strategy_1 = require("./strategies/google.strategy");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_1.DatabaseModule,
            typeorm_1.TypeOrmModule.forFeature([entities_1.User]),
            passport_1.PassportModule,
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    secret: configService.get('ACCESS_SECRET_KEY') ||
                        'nguyenthaibinhduongdevchatappaccess',
                    signOptions: { expiresIn: '15m' },
                }),
            }),
            mailer_1.MailerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    transport: {
                        host: config.get('SMTP_HOST'),
                        port: config.get('SMTP_PORT'),
                        secure: config.get('SMTP_SECURE') === 'true',
                        auth: {
                            user: config.get('SMTP_USER'),
                            pass: config.get('SMTP_PASS'),
                        },
                    },
                    defaults: {
                        from: config.get('SMTP_USER') || 'no-reply@example.com',
                    },
                    template: {
                        dir: path_1.default.join(process.cwd(), 'apps', 'auth', 'src', 'templates'),
                        adapter: new handlebars_adapter_1.HandlebarsAdapter(),
                        options: {
                            strict: true,
                        },
                    },
                }),
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            user_repository_1.UserRepository,
            jwt_strategy_1.JwtStrategy,
            github_strategy_1.GithubStrategy,
            google_strategy_1.GoogleStrategy,
            {
                provide: 'REDIS_CLIENT',
                inject: [config_1.ConfigService],
                useFactory: async (config) => {
                    return new ioredis_1.default({
                        host: (0, common_2.getEnv)('REDIS_HOST', 'localhost'),
                        port: (0, common_2.getEnvNumber)('REDIS_PORT', 6379),
                        password: config.get('REDIS_PASSWORD') || undefined,
                    });
                },
            },
        ],
        exports: [auth_service_1.AuthService, jwt_1.JwtModule, passport_1.PassportModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map