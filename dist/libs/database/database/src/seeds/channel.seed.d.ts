import { DataSource } from 'typeorm';
export declare class ChannelSeeder {
    private dataSource;
    constructor(dataSource: DataSource);
    run(): Promise<void>;
}
