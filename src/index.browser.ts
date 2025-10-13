/**
 * Browser entry point - HTTP only
 */

import { SpiceClient as SpiceClientCommon } from './client-common';
import { platform } from './platform/browser';
import * as retry from './retry.browser';
import type { SpiceClientConfig } from './interfaces';

export class SpiceClient extends SpiceClientCommon {
  constructor(params: string | SpiceClientConfig = {}) {
    super(params, platform, retry, undefined);
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
