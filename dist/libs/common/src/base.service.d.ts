import { DeepPartial, EntityTarget, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm';
export declare abstract class BaseService<T extends {
    id: any;
}> {
    protected readonly repository: Repository<T>;
    protected constructor(repository: Repository<T>);
    create(data: DeepPartial<T> | DeepPartial<T>[]): Promise<T | T[]>;
    getById(options: FindOneOptions<T>): Promise<T>;
    getAll(search?: string, limit?: number, page?: number, isDeleted?: boolean): Promise<{
        items: T[];
        total: number;
        limit?: number;
        page?: number;
    }>;
    update(id: number, options: FindOneOptions<T>, entity: DeepPartial<T>): Promise<T>;
    delete(ids: number | number[], isSoft?: boolean): Promise<void>;
    check_exist_no_data<U extends import('typeorm').ObjectLiteral>(entity: EntityTarget<U>, where: FindOptionsWhere<U>, errorMessage: string): Promise<void>;
    check_non_exist_no_data<U extends import('typeorm').ObjectLiteral>(entity: EntityTarget<U>, where: FindOptionsWhere<U>, errorMessage: string): Promise<void>;
    check_exist_with_data<U extends import('typeorm').ObjectLiteral>(entity: EntityTarget<U>, where: FindOptionsWhere<U>, errorMessage?: string): Promise<U>;
    check_exist_with_datas<U extends import('typeorm').ObjectLiteral>(entity: EntityTarget<U>, where: FindOptionsWhere<U>, errorMessage?: string): Promise<U[]>;
    remove_field_user(item: any): any;
}
//# sourceMappingURL=base.service.d.ts.map