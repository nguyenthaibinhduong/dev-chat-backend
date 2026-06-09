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
exports.Repository = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const channel_entity_1 = require("./channel.entity");
let Repository = class Repository {
};
exports.Repository = Repository;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Repository.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 512 }),
    __metadata("design:type", String)
], Repository.prototype, "repo_id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: false }),
    __metadata("design:type", user_entity_1.User)
], Repository.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)(() => channel_entity_1.Channel, (channel) => channel.repositories),
    (0, typeorm_1.JoinTable)({
        name: 'repository_channels',
        joinColumn: { name: 'repository_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'channel_id', referencedColumnName: 'id' },
    }),
    __metadata("design:type", Array)
], Repository.prototype, "channels", void 0);
exports.Repository = Repository = __decorate([
    (0, typeorm_1.Entity)('repositories')
], Repository);
//# sourceMappingURL=repository.entity.js.map