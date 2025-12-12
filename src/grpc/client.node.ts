/**
 * gRPC Flight client implementation - Node.js only
 */

import path from 'path';
import * as fs from 'fs';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import { EventEmitter } from 'stream';
import { FlightClient, FlightInfo, DescriptorType, Ticket } from '../flight';
import { platform } from '../platform/node';
// Note: Flight SQL prepared statements are not currently supported by the Spice server.
// The server uses a custom protocol. For parameterized queries, we use client-side substitution.
// This is secure for the supported use cases and matches the HTTP API behavior.

const PROTO_PATH = './proto/Flight.proto';
const PROTO_DOWNLOAD_URL =
  process.env.SPICE_PROTO_URL || 'https://data.spiceai.io/v1/proto/flight';

// Determine the base path for the proto file
// When built, __dirname will be dist/node/grpc, so we need to go up one level
const PACKAGE_PATH = __dirname.includes('.next')
  ? path.join(
      __dirname.substring(0, __dirname.indexOf('.next')),
      './node_modules/@spiceai/spice/dist/node/',
    )
  : path.join(__dirname, '..');
const fullProtoPath = path.join(PACKAGE_PATH, PROTO_PATH);

// In-memory proto content cache
let protoContent: string | null = null;
let flightProto: any = null;
let grpcAvailable = false;

/**
 * Downloads the Flight.proto file from the remote URL and keeps it in memory
 */
async function downloadProtoFile(): Promise<string> {
  try {
    console.log('[spice.js] Downloading Flight.proto from remote source...');
    const response = await platform.fetch(PROTO_DOWNLOAD_URL, {
      method: 'GET',
      headers: {},
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download proto: ${response.status} ${response.statusText}`,
      );
    }

    const content = await response.text();
    console.log('[spice.js] Flight.proto downloaded successfully');

    return content;
  } catch (error: any) {
    console.warn(`[spice.js] Failed to download proto file: ${error.message}`);
    throw error;
  }
}

/**
 * Loads proto content from local file or downloads it
 * Returns the proto content as a string
 */
async function loadProtoContent(): Promise<string | null> {
  // Try local file first
  if (fs.existsSync(fullProtoPath)) {
    return fs.readFileSync(fullProtoPath, 'utf-8');
  }

  // Try to download
  try {
    return await downloadProtoFile();
  } catch (error) {
    return null;
  }
}

/**
 * Loads proto definition from content in memory using protobufjs
 */
function loadProtoFromContent(content: string): any {
  try {
    // Parse the proto content directly in memory using protobufjs
    const root = protobuf.parse(content, { keepCase: false }).root;

    // Convert to JSON descriptor
    const json = root.toJSON();

    // Load from JSON
    const packageDefinition = protoLoader.fromJSON(json, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const arrow = grpc.loadPackageDefinition(packageDefinition).arrow as any;
    return arrow.flight.protocol;
  } catch (error: any) {
    console.warn(
      '[spice.js] Failed to load proto from content:',
      error.message,
    );
    throw error;
  }
}

/**
 * Initialize the proto file (sync attempt)
 */
function initializeProto(): void {
  try {
    // Try synchronous load from local file first (normal case)
    if (fs.existsSync(fullProtoPath)) {
      const content = fs.readFileSync(fullProtoPath, 'utf-8');
      flightProto = loadProtoFromContent(content);
      protoContent = content;
      grpcAvailable = true;
    }
  } catch (error: any) {
    // Silent failure - will attempt download during client initialization
    grpcAvailable = false;
  }
}

// Initialize on module load
initializeProto();

export class GrpcFlightClient {
  private apiKey?: string;
  private flightUrl: string;
  private userAgent: string;
  private flightTlsEnabled: boolean;
  private initPromise: Promise<void>;
  private useGrpc: boolean = grpcAvailable;

  constructor(
    apiKey: string | undefined,
    flightUrl: string,
    userAgent: string,
    flightTlsEnabled: boolean,
  ) {
    this.apiKey = apiKey;
    this.flightUrl = flightUrl;
    this.userAgent = userAgent;
    this.flightTlsEnabled = flightTlsEnabled;
    this.initPromise = this.initialize();
  }

  /**
   * Initializes gRPC by downloading the proto file if needed.
   */
  private async initialize(): Promise<void> {
    // If already available, return immediately
    if (this.useGrpc && grpcAvailable && flightProto) {
      return;
    }

    try {
      // Check if we already have proto content in memory
      if (!protoContent) {
        protoContent = await loadProtoContent();
      }

      if (!protoContent) {
        this.useGrpc = false;
        return;
      }

      // Load the proto from content
      const proto = loadProtoFromContent(protoContent);

      if (!proto?.FlightService) {
        throw new Error('Invalid proto file structure');
      }

      flightProto = proto;
      grpcAvailable = true;
      this.useGrpc = true;
    } catch (error: any) {
      console.warn(
        `[spice.js] gRPC initialization failed: ${error.message}. Using HTTP endpoint.`,
      );
      this.useGrpc = false;
    }
  }

  /**
   * Ensures the client is fully initialized before use.
   * @returns true if gRPC is available, false otherwise.
   */
  async ensureInitialized(): Promise<boolean> {
    await this.initPromise;
    return this.useGrpc && grpcAvailable && flightProto !== null;
  }

  private createClient(meta: grpc.Metadata): FlightClient {
    if (!flightProto?.FlightService) {
      throw new Error('gRPC Flight protocol not initialized');
    }

    // gRPC channel options
    const channelOptions = {};

    if (!this.flightTlsEnabled) {
      return new flightProto.FlightService(
        this.flightUrl,
        grpc.credentials.createInsecure(),
        channelOptions,
      );
    }

    const creds = grpc.credentials.createSsl();
    const metaCallback = (_params: any, callback: any) => {
      callback(null, meta);
    };
    const callCreds =
      grpc.credentials.createFromMetadataGenerator(metaCallback);
    const combCreds = grpc.credentials.combineChannelCredentials(
      creds,
      callCreds,
    );
    return new flightProto.FlightService(
      this.flightUrl,
      combCreds,
      channelOptions,
    );
  }

  /**
   * Substitutes parameters into a SQL query using positional placeholders ($1, $2, etc.)
   * This is a client-side substitution - the server will receive the final SQL.
   */
  private substitutePositionalParameters(
    queryText: string,
    parameters: any[],
  ): string {
    let result = queryText;
    for (let i = 0; i < parameters.length; i++) {
      const placeholder = `$${i + 1}`;
      const value = this.formatParameterValue(parameters[i]);
      // Replace all occurrences of this placeholder
      result = result.split(placeholder).join(value);
    }
    return result;
  }

  /**
   * Substitutes named parameters into a SQL query (:name style)
   * This is a client-side substitution - the server will receive the final SQL.
   */
  private substituteNamedParameters(
    queryText: string,
    parameters: Record<string, any>,
  ): string {
    let result = queryText;
    for (const [name, value] of Object.entries(parameters)) {
      // Match :name but not ::type (PostgreSQL cast syntax)
      // Use regex to match :name followed by non-alphanumeric or end of string
      const regex = new RegExp(`:${name}(?![a-zA-Z0-9_])`, 'g');
      result = result.replace(regex, this.formatParameterValue(value));
    }
    return result;
  }

  /**
   * Formats a parameter value for SQL substitution
   */
  private formatParameterValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      // Escape single quotes and wrap in quotes
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return `X'${Buffer.from(value).toString('hex')}'`;
    }
    // Handle Param objects
    if (value && typeof value === 'object' && 'value' in value) {
      return this.formatParameterValue(value.value);
    }
    // Default: convert to string
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  async executeQuery(
    queryText: string,
    parameters?: any,
    headers?: { [key: string]: string },
  ): Promise<EventEmitter> {
    const meta = new grpc.Metadata();
    meta.set('authorization', `Bearer ${this.apiKey || ''}`);
    meta.set('User-Agent', this.userAgent);
    // Advertise that we accept compressed responses
    meta.set('grpc-accept-encoding', 'gzip,deflate');

    // Add custom headers as Flight metadata
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        meta.set(key, value);
      });
    }

    const client: FlightClient = this.createClient(meta);

    // Check if we have parameters to bind
    const hasParameters =
      parameters &&
      ((Array.isArray(parameters) && parameters.length > 0) ||
        (!Array.isArray(parameters) && Object.keys(parameters).length > 0));

    // For parameterized queries, use client-side substitution
    // Note: Server-side parameter binding via Flight SQL prepared statements
    // is not supported by the Spice server's current implementation.
    let finalQuery = queryText;
    if (hasParameters) {
      if (Array.isArray(parameters)) {
        // Positional parameters: $1, $2, etc.
        finalQuery = this.substitutePositionalParameters(queryText, parameters);
      } else {
        // Named parameters: :name, :value, etc.
        finalQuery = this.substituteNamedParameters(queryText, parameters);
      }
    }

    // Use simple GetFlightInfo/DoGet
    const commandBuff = Buffer.from(finalQuery, 'utf8');

    const flightTicket = await new Promise<Ticket>((resolve, reject) => {
      client.GetFlightInfo(
        { type: DescriptorType.CMD, cmd: commandBuff },
        (err: any, result: FlightInfo) => {
          if (err) {
            reject(err);
            return;
          }
          if (!result?.endpoint?.[0]?.ticket) {
            reject(new Error('Invalid FlightInfo response: missing ticket'));
            return;
          }
          resolve(result.endpoint[0].ticket);
        },
      );
    });

    // DoGet returns a stream of FlightData
    return client.DoGet(flightTicket);
  }
}
