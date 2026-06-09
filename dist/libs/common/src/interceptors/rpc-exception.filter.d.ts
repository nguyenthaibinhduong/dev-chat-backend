import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
export declare class GatewayRpcExceptionFilter implements ExceptionFilter {
    catch(exception: RpcException, host: ArgumentsHost): any;
}
//# sourceMappingURL=rpc-exception.filter.d.ts.map