/**
 * gRPC Flight client implementation - Node.js only
 */
import path from 'path';
import * as fs from 'fs';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import { Message } from 'apache-arrow';
import { DescriptorType } from '../flight';
import { platform } from '../platform/node';
import { Logger } from '../logger';
import { FlightSqlActions, decodeCreatePreparedStatementResult, encodeClosePreparedStatementRequest, encodeCommandPreparedStatementQuery, encodeCreatePreparedStatementRequest, serializeNamedParametersToIPC, serializeParametersToIPC, } from '../adbc/client';
/** Marks the start of each message in an Arrow IPC stream. */
const IPC_CONTINUATION_MARKER = 0xffffffff;
/**
 * Splits an Arrow IPC stream into the header/body pairs Flight expects.
 *
 * An IPC stream frames each message as
 * `[continuation][metadata length][metadata][body]`, while Flight carries the
 * metadata and the body as separate fields. Sending the undivided stream as one body
 * makes the server fail to decode the root message.
 */
export function splitArrowIpcStream(bytes) {
    const buffer = Buffer.from(bytes);
    const messages = [];
    let offset = 0;
    while (offset + 8 <= buffer.length) {
        if (buffer.readUInt32LE(offset) !== IPC_CONTINUATION_MARKER) {
            break;
        }
        offset += 4;
        const metadataLength = buffer.readUInt32LE(offset);
        offset += 4;
        if (metadataLength === 0) {
            break; // end-of-stream marker
        }
        const header = buffer.subarray(offset, offset + metadataLength);
        offset += metadataLength;
        const bodyLength = Number(arrowMessageBodyLength(header));
        const body = buffer.subarray(offset, offset + bodyLength);
        offset += bodyLength;
        messages.push({ header, body });
    }
    return messages;
}
/**
 * Reads the body length declared by an Arrow IPC message header.
 */
function arrowMessageBodyLength(header) {
    return Message.decode(header).bodyLength;
}
const PROTO_PATH = './proto/Flight.proto';
const PROTO_DOWNLOAD_URL = process.env.SPICE_PROTO_URL || 'https://data.spiceai.io/v1/proto/flight';
// Determine the base path for the proto file
// When built, __dirname will be dist/node/grpc, so we need to go up one level
const PACKAGE_PATH = __dirname.includes('.next')
    ? path.join(__dirname.substring(0, __dirname.indexOf('.next')), './node_modules/@spiceai/spice/dist/node/')
    : path.join(__dirname, '..');
const fullProtoPath = path.join(PACKAGE_PATH, PROTO_PATH);
// In-memory proto content cache
let protoContent = null;
let flightProto = null;
let grpcAvailable = false;
/**
 * Downloads the Flight.proto file from the remote URL and keeps it in memory
 */
async function downloadProtoFile(logger) {
    try {
        logger?.info('[spice.js] Downloading Flight.proto from remote source...');
        const response = await platform.fetch(PROTO_DOWNLOAD_URL, {
            method: 'GET',
            headers: {},
        });
        if (!response.ok) {
            throw new Error(`Failed to download proto: ${response.status} ${response.statusText}`);
        }
        const content = await response.text();
        logger?.info('[spice.js] Flight.proto downloaded successfully');
        return content;
    }
    catch (error) {
        logger?.warn(`[spice.js] Failed to download proto file: ${error.message}`);
        throw error;
    }
}
/**
 * Loads proto content from local file or downloads it
 * Returns the proto content as a string
 */
async function loadProtoContent(logger) {
    // Try local file first
    if (fs.existsSync(fullProtoPath)) {
        return fs.readFileSync(fullProtoPath, 'utf-8');
    }
    // Try to download
    try {
        return await downloadProtoFile(logger);
    }
    catch (error) {
        return null;
    }
}
/**
 * Loads proto definition from content in memory using protobufjs
 */
function loadProtoFromContent(content, logger) {
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
        const arrow = grpc.loadPackageDefinition(packageDefinition).arrow;
        return arrow.flight.protocol;
    }
    catch (error) {
        logger?.info('[spice.js] Failed to load proto from content:', error.message);
        throw error;
    }
}
/**
 * Initialize the proto file (sync attempt)
 */
function initializeProto() {
    try {
        // Try synchronous load from local file first (normal case)
        if (fs.existsSync(fullProtoPath)) {
            const content = fs.readFileSync(fullProtoPath, 'utf-8');
            flightProto = loadProtoFromContent(content);
            protoContent = content;
            grpcAvailable = true;
        }
    }
    catch (error) {
        // Silent failure - will attempt download during client initialization
        grpcAvailable = false;
    }
}
// Initialize on module load
initializeProto();
export class GrpcFlightClient {
    apiKey;
    flightUrl;
    userAgent;
    flightTlsEnabled;
    initPromise;
    useGrpc = grpcAvailable;
    logger;
    tlsClientCertFile;
    tlsClientKeyFile;
    tlsRootCertFile;
    constructor(apiKey, flightUrl, userAgent, flightTlsEnabled, logger, tlsClientCertFile, tlsClientKeyFile, tlsRootCertFile) {
        this.apiKey = apiKey;
        this.flightUrl = flightUrl;
        this.userAgent = userAgent;
        this.flightTlsEnabled = flightTlsEnabled;
        this.logger = logger || new Logger(true);
        this.tlsClientCertFile = tlsClientCertFile;
        this.tlsClientKeyFile = tlsClientKeyFile;
        this.tlsRootCertFile = tlsRootCertFile;
        this.initPromise = this.initialize();
    }
    /**
     * Initializes gRPC by downloading the proto file if needed.
     */
    async initialize() {
        // If already available, return immediately
        if (this.useGrpc && grpcAvailable && flightProto) {
            return;
        }
        try {
            // Check if we already have proto content in memory
            if (!protoContent) {
                protoContent = await loadProtoContent(this.logger);
            }
            if (!protoContent) {
                this.useGrpc = false;
                return;
            }
            // Load the proto from content
            const proto = loadProtoFromContent(protoContent, this.logger);
            if (!proto?.FlightService) {
                throw new Error('Invalid proto file structure');
            }
            flightProto = proto;
            grpcAvailable = true;
            this.useGrpc = true;
        }
        catch (error) {
            this.logger.warn(`[spice.js] gRPC initialization failed: ${error.message}. Using HTTP endpoint.`);
            this.useGrpc = false;
        }
    }
    /**
     * Ensures the client is fully initialized before use.
     * @returns true if gRPC is available, false otherwise.
     */
    async ensureInitialized() {
        await this.initPromise;
        return this.useGrpc && grpcAvailable && flightProto !== null;
    }
    createClient(meta) {
        if (!flightProto?.FlightService) {
            throw new Error('gRPC Flight protocol not initialized');
        }
        // gRPC channel options
        const channelOptions = {};
        if (!this.flightTlsEnabled) {
            return new flightProto.FlightService(this.flightUrl, grpc.credentials.createInsecure(), channelOptions);
        }
        const rootCerts = this.tlsRootCertFile ? fs.readFileSync(this.tlsRootCertFile) : null;
        const clientCert = this.tlsClientCertFile ? fs.readFileSync(this.tlsClientCertFile) : null;
        const clientKey = this.tlsClientKeyFile ? fs.readFileSync(this.tlsClientKeyFile) : null;
        const creds = grpc.credentials.createSsl(rootCerts, clientKey, clientCert);
        const metaCallback = (_params, callback) => {
            callback(null, meta);
        };
        const callCreds = grpc.credentials.createFromMetadataGenerator(metaCallback);
        const combCreds = grpc.credentials.combineChannelCredentials(creds, callCreds);
        return new flightProto.FlightService(this.flightUrl, combCreds, channelOptions);
    }
    /**
     * Runs a parameterized query as a Flight SQL prepared statement.
     *
     * CreatePreparedStatement -> DoPut (bind) -> GetFlightInfo -> DoGet, then
     * ClosePreparedStatement once the result stream finishes. Values travel as a typed
     * Arrow record batch, so they are never spliced into the SQL text and their types
     * survive the round trip.
     */
    async executePreparedStatement(client, queryText, parameters) {
        const created = await this.doAction(client, FlightSqlActions.CreatePreparedStatement, encodeCreatePreparedStatementRequest(queryText));
        if (created.length === 0) {
            throw new Error('Failed to prepare the query: the runtime returned no prepared statement');
        }
        const { preparedStatementHandle } = decodeCreatePreparedStatementResult(Buffer.from(created[0].body));
        // The server may return a new handle once parameters are bound; that handle is
        // the one the query and the close must use.
        let handle = preparedStatementHandle;
        try {
            const ipc = Array.isArray(parameters)
                ? serializeParametersToIPC(parameters)
                : serializeNamedParametersToIPC(parameters);
            handle = await this.bindParameters(client, handle, ipc);
            const ticket = await new Promise((resolve, reject) => {
                client.GetFlightInfo({
                    type: DescriptorType.CMD,
                    cmd: encodeCommandPreparedStatementQuery(handle),
                }, (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!result?.endpoint?.[0]?.ticket) {
                        reject(new Error('Invalid FlightInfo response: missing ticket'));
                        return;
                    }
                    resolve(result.endpoint[0].ticket);
                });
            });
            const stream = client.DoGet(ticket);
            // Release the statement once the results are done with, either way.
            const close = () => {
                this.doAction(client, FlightSqlActions.ClosePreparedStatement, encodeClosePreparedStatementRequest(handle)).catch(() => {
                    // A statement the server already dropped is not a caller-visible problem.
                });
            };
            stream.once('end', close);
            stream.once('error', close);
            return stream;
        }
        catch (err) {
            await this.doAction(client, FlightSqlActions.ClosePreparedStatement, encodeClosePreparedStatementRequest(handle)).catch(() => {
                // Preserve the original failure.
            });
            throw err;
        }
    }
    /**
     * Sends a DoAction and collects its results.
     */
    doAction(client, type, body) {
        return new Promise((resolve, reject) => {
            const results = [];
            const call = client.DoAction({ type, body });
            call.on('data', (data) => results.push(data));
            call.on('error', reject);
            call.on('end', () => resolve(results));
        });
    }
    /**
     * Binds a parameter batch to a prepared statement via DoPut.
     *
     * Returns the handle to use for the query — the server may hand back an updated one.
     */
    bindParameters(client, handle, ipcBytes) {
        return new Promise((resolve, reject) => {
            const results = [];
            const call = client.DoPut();
            call.on('data', (data) => results.push(data));
            call.on('error', reject);
            call.on('end', () => {
                const metadata = results[0]?.appMetadata ?? results[0]?.app_metadata;
                if (metadata && metadata.length > 0) {
                    try {
                        const updated = decodeCreatePreparedStatementResult(Buffer.from(metadata));
                        if (updated.preparedStatementHandle) {
                            resolve(updated.preparedStatementHandle);
                            return;
                        }
                    }
                    catch {
                        // No updated handle in the response; the original stays valid.
                    }
                }
                resolve(handle);
            });
            const cmd = encodeCommandPreparedStatementQuery(handle);
            const messages = splitArrowIpcStream(ipcBytes);
            messages.forEach((message, index) => {
                call.write({
                    // The descriptor identifies which statement the batch binds to, and belongs
                    // on the first message of the stream.
                    ...(index === 0
                        ? { flightDescriptor: { type: DescriptorType.CMD, cmd } }
                        : {}),
                    dataHeader: message.header,
                    dataBody: message.body,
                    appMetadata: Buffer.alloc(0),
                });
            });
            call.end();
        });
    }
    async executeQuery(queryText, parameters, headers) {
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
        const client = this.createClient(meta);
        // Check if we have parameters to bind
        const hasParameters = parameters &&
            ((Array.isArray(parameters) && parameters.length > 0) ||
                (!Array.isArray(parameters) && Object.keys(parameters).length > 0));
        // Parameterized queries bind server-side via Flight SQL prepared statements,
        // so values keep their types and never enter the SQL text.
        if (hasParameters) {
            return this.executePreparedStatement(client, queryText, parameters);
        }
        // Use simple GetFlightInfo/DoGet
        const commandBuff = Buffer.from(queryText, 'utf8');
        const flightTicket = await new Promise((resolve, reject) => {
            client.GetFlightInfo({ type: DescriptorType.CMD, cmd: commandBuff }, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!result?.endpoint?.[0]?.ticket) {
                    reject(new Error('Invalid FlightInfo response: missing ticket'));
                    return;
                }
                resolve(result.endpoint[0].ticket);
            });
        });
        // DoGet returns a stream of FlightData
        return client.DoGet(flightTicket);
    }
}
//# sourceMappingURL=client.node.js.map