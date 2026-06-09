"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = exports.dataSource = exports.makeDataSourceOptions = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const typeorm_2 = require("typeorm");
const Entities = __importStar(require("../../entities/src"));
const common_2 = require("../../common/src");
const makeDataSourceOptions = (config) => ({
    type: 'postgres',
    host: (config === null || config === void 0 ? void 0 : config.get('DB_HOST')) || (0, common_2.getEnv)('DB_HOST', 'localhost'),
    port: parseInt((config === null || config === void 0 ? void 0 : config.get('POSTGRES_PORT')) || process.env.POSTGRES_PORT || '5432', 10),
    username: (config === null || config === void 0 ? void 0 : config.get('POSTGRES_USER')) || process.env.POSTGRES_USER || 'postgres',
    password: (config === null || config === void 0 ? void 0 : config.get('POSTGRES_PASSWORD')) || process.env.POSTGRES_PASSWORD || 'password',
    database: (config === null || config === void 0 ? void 0 : config.get('POSTGRES_DB')) || process.env.POSTGRES_DB || 'dev_chat',
    entities: Object.values(Entities),
    migrations: ['dist/libs/database/migrations/*.js'],
    synchronize: true,
    logging: false,
});
exports.makeDataSourceOptions = makeDataSourceOptions;
exports.dataSource = new typeorm_2.DataSource((0, exports.makeDataSourceOptions)());
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, envFilePath: `${process.env.NODE_ENV ? `.env.${process.env.NODE_ENV || ''}` : '.env'}` }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    ...(0, exports.makeDataSourceOptions)(config),
                    synchronize: true,
                }),
            }),
        ],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map