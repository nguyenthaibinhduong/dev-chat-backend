import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
export declare const makeDataSourceOptions: (config?: ConfigService) => DataSourceOptions;
export declare const dataSource: DataSource;
export declare class DatabaseModule {
}
