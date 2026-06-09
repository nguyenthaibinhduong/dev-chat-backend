import { RpcException } from '@nestjs/microservices';
export declare class RpcCustomException extends RpcException {
    constructor(message: string, status?: number);
}
