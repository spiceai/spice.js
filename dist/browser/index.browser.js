/**
 * Browser entry point - HTTP only
 */
import { SpiceClient as SpiceClientCommon } from './client-common';
import { platform } from './platform/browser';
import * as retry from './retry.browser';
export class SpiceClient extends SpiceClientCommon {
    constructor(params = {}) {
        super(params, platform, retry, undefined);
    }
}
// Export Param class for explicit Arrow type control
export { Param } from './param';
export { AsyncQuery } from './async-query';
//# sourceMappingURL=index.browser.js.map