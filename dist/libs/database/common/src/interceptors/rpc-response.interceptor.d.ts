import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
export declare class RpcResponseInterceptor<T> implements NestInterceptor<T, {
    status: number;
    msg: string;
    data: T;
}> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<{
        status: number;
        msg: string;
        data: T;
    }>;
}
