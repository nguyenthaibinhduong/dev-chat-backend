"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseService = void 0;
const typeorm_1 = require("typeorm");
const common_1 = require("@nestjs/common");
const rpc_custom_exception_1 = require("./interceptors/rpc-custom.exception");
class BaseService {
    constructor(repository) {
        this.repository = repository;
    }
    async create(data) {
        return await this.repository.save(data);
    }
    async getById(options) {
        const entity = await this.repository.findOne(options);
        if (!entity)
            throw new common_1.NotFoundException('Entity not found');
        return entity;
    }
    async getAll(search, limit, page, isDeleted = false) {
        const where = {};
        if ('active' in this.repository.metadata.propertiesMap) {
            Object.assign(where, { active: isDeleted });
        }
        if (search && 'name' in this.repository.metadata.propertiesMap) {
            Object.assign(where, { name: (0, typeorm_1.Like)(`%${search}%`) });
        }
        const options = { where };
        if (limit && page) {
            options.take = limit;
            options.skip = (page - 1) * limit;
        }
        const [items, total] = await this.repository.findAndCount(options);
        return { items, total, ...(limit && { limit }), ...(page && { page }) };
    }
    async update(id, options, entity) {
        await this.getById(options);
        await this.repository.update(id, entity);
        return this.getById(options);
    }
    async delete(ids, isSoft = false) {
        const idArray = Array.isArray(ids) ? ids : [ids];
        const entities = await this.repository.find({ where: { id: (0, typeorm_1.In)(idArray) } });
        if (entities.length !== idArray.length) {
            throw new common_1.NotFoundException('One or more entities not found');
        }
        if (isSoft && 'active' in this.repository.metadata.propertiesMap) {
            await this.repository.update(idArray, { active: false });
        }
        else {
            await this.repository.delete(idArray);
        }
    }
    async check_exist_no_data(entity, where, errorMessage) {
        const repo = this.repository.manager.getRepository(entity);
        const existing = await repo.findOne({ where });
        if (existing)
            throw new rpc_custom_exception_1.RpcCustomException(errorMessage, 400);
    }
    async check_non_exist_no_data(entity, where, errorMessage) {
        const repo = this.repository.manager.getRepository(entity);
        const existing = await repo.findOne({ where });
        if (!existing)
            throw new rpc_custom_exception_1.RpcCustomException(errorMessage, 400);
    }
    async check_exist_with_data(entity, where, errorMessage) {
        const repo = this.repository.manager.getRepository(entity);
        const existing = await repo.findOne({ where });
        if (!existing && errorMessage)
            throw new rpc_custom_exception_1.RpcCustomException(errorMessage, 400);
        return existing;
    }
    async check_exist_with_datas(entity, where, errorMessage) {
        const repo = this.repository.manager.getRepository(entity);
        const existing = await repo.find({ where });
        if ((!existing || existing.length === 0) && errorMessage) {
            throw new rpc_custom_exception_1.RpcCustomException(errorMessage, 400);
        }
        return existing;
    }
    remove_field_user(item) {
        if (!item)
            return item;
        delete item.password;
        delete item.provider;
        delete item.provider_id;
        delete item.role;
        delete item.refresh_token;
        delete item.created_at;
        delete item.updated_at;
        delete item.resetToken;
        return item;
    }
}
exports.BaseService = BaseService;
//# sourceMappingURL=base.service.js.map