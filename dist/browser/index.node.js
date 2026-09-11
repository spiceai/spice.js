/**
 * Node.js entry point with full gRPC support
 */
import { SpiceClient as SpiceClientCommon } from './client-common';
import { platform } from './platform/node';
import { GrpcFlightClient } from './grpc/client.node';
import * as retry from './retry.node';
export class SpiceClient extends SpiceClientCommon {
    constructor(params = {}) {
        super(params, platform, retry, GrpcFlightClient);
    }
}
// Export Param class for explicit Arrow type control
export { Param } from './param';
export { AsyncQuery } from './async-query';
//# sourceMappingURL=index.node.js.map