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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../../../../libs/entities/src");
const auth_dto_1 = require("../dto/auth.dto");
let UserRepository = class UserRepository {
    constructor(repository) {
        this.repository = repository;
    }
    async findByEmail(email) {
        return this.repository.findOne({ where: { email } });
    }
    async findByProvider(provider, provider_id) {
        return this.repository.findOne({ where: { provider, provider_id } });
    }
    async findById(id) {
        return this.repository.findOne({ where: { id } });
    }
    async findByrefresh_token(refresh_token) {
        return this.repository.findOne({ where: { refresh_token } });
    }
    async create(userData) {
        const user = this.repository.create({
            ...userData,
            role: userData.role || auth_dto_1.UserRole.USER,
        });
        return this.repository.save(user);
    }
    async save(user) {
        return this.repository.save(user);
    }
    async findAll() {
        return this.repository.find();
    }
    async findByRole(role) {
        return this.repository.find({ where: { role } });
    }
    async findByVerificationToken(token) {
        return this.repository.findOne({ where: { verification_token: token } });
    }
    async remove(id) {
        await this.repository.delete(id);
    }
};
exports.UserRepository = UserRepository;
exports.UserRepository = UserRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], UserRepository);
//# sourceMappingURL=user.repository.js.map