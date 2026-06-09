"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationModule = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const notifications_controller_1 = require("./notifications.controller");
const notifications_service_1 = require("./notifications.service");
const mongoose_1 = require("@nestjs/mongoose");
const config_1 = require("@nestjs/config");
const schemas_1 = require("../../../libs/schemas/src");
const typeorm_1 = require("@nestjs/typeorm");
const entities_1 = require("../../../libs/entities/src");
const database_1 = require("../../../libs/database/src");
const common_2 = require("../../../libs/common/src");
let NotificationModule = class NotificationModule {
};
exports.NotificationModule = NotificationModule;
exports.NotificationModule = NotificationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            microservices_1.ClientsModule.register([
                {
                    name: 'NOTIF_SERVICE',
                    transport: microservices_1.Transport.KAFKA,
                    options: {
                        client: {
                            brokers: (0, common_2.getKafkaBrokers)(),
                        },
                        consumer: {
                            groupId: 'notification-consumer',
                        },
                    },
                },
            ]),
            database_1.DatabaseModule,
            typeorm_1.TypeOrmModule.forFeature([entities_1.Channel, entities_1.User]),
            mongoose_1.MongooseModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    uri: configService.get('MONGODB_URI'),
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                }),
            }),
            mongoose_1.MongooseModule.forFeature([
                { name: schemas_1.Notification.name, schema: schemas_1.NotificationSchema },
            ]),
        ],
        controllers: [notifications_controller_1.NotificationController],
        providers: [notifications_service_1.NotificationService],
    })
], NotificationModule);
//# sourceMappingURL=notifications.module.js.map