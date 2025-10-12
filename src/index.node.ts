/**
 * Node.js entry point with full gRPC support
 */

import { SpiceClient as SpiceClientCommon } from './client-common';
import { platform } from './platform/node';
import { GrpcFlightClient } from './grpc/client.node';
import * as retry from './retry.node';
import type { SpiceClientConfig } from './interfaces';

export class SpiceClient extends SpiceClientCommon {
  constructor(params: string | SpiceClientConfig = {}) {
    super(params, platform, retry, GrpcFlightClient);
  }
}

export type {
  SpiceClientConfig,
  SchemaField,
  SqlV1JsonResponse as SqlJsonResponse,
  RefreshAccelerationOptions,
  RefreshAccelerationResponse,
  NsqlOptions,
  NsqlResponse,
  QueryHeaders,
  RefreshOverrides, // deprecated, kept for backward compatibility
} from './interfaces';
