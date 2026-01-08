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

// Export Param class for explicit Arrow type control
export { Param } from './param';
export type {
  ArrowTypeId,
  TimeUnit,
  DecimalOptions,
  TimestampOptions,
  DurationOptions,
  TimeOptions,
  FixedSizeBinaryOptions,
} from './param';

export type {
  SpiceClientConfig,
  SchemaField,
  SqlV1JsonResponse as SqlJsonResponse,
  RefreshAccelerationOptions,
  RefreshAccelerationResponse,
  NsqlOptions,
  NsqlResponse,
  SqlQueryOptions,
  QueryParameters,
  QueryParameterValue,
  SearchOptions,
  SearchResponse,
  SearchMatch,
  QueryHeaders,
  RefreshOverrides, // deprecated, kept for backward compatibility
} from './interfaces';
