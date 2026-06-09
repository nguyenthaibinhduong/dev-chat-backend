import { DataSource } from 'typeorm';
export declare class MessageSeeder {
    private dataSource;
    constructor(dataSource: DataSource);
    run(): Promise<void>;
}
