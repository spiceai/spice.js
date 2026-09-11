/**
 * gRPC Flight client implementation - Node.js only
 */
import { EventEmitter } from 'stream';
import { Logger } from '../logger';
/**
 * Splits an Arrow IPC stream into the header/body pairs Flight expects.
 *
 * An IPC stream frames each message as
 * `[continuation][metadata length][metadata][body]`, while Flight carries the
 * metadata and the body as separate fields. Sending the undivided stream as one body
 * makes the server fail to decode the root message.
 */
export declare function splitArrowIpcStream(bytes: Uint8Array): {
    header: Buffer;
    body: Buffer;
}[];
export declare class GrpcFlightClient {
    private apiKey?;
    private flightUrl;
    private userAgent;
    private flightTlsEnabled;
    private initPromise;
    private useGrpc;
    private logger;
    private tlsClientCertFile?;
    private tlsClientKeyFile?;
    private tlsRootCertFile?;
    constructor(apiKey: string | undefined, flightUrl: string, userAgent: string, flightTlsEnabled: boolean, logger?: Logger, tlsClientCertFile?: string, tlsClientKeyFile?: string, tlsRootCertFile?: string);
    /**
     * Initializes gRPC by downloading the proto file if needed.
     */
    private initialize;
    /**
     * Ensures the client is fully initialized before use.
     * @returns true if gRPC is available, false otherwise.
     */
    ensureInitialized(): Promise<boolean>;
    private createClient;
    /**
     * Runs a parameterized query as a Flight SQL prepared statement.
     *
     * CreatePreparedStatement -> DoPut (bind) -> GetFlightInfo -> DoGet, then
     * ClosePreparedStatement once the result stream finishes. Values travel as a typed
     * Arrow record batch, so they are never spliced into the SQL text and their types
     * survive the round trip.
     */
    private executePreparedStatement;
    /**
     * Sends a DoAction and collects its results.
     */
    private doAction;
    /**
     * Binds a parameter batch to a prepared statement via DoPut.
     *
     * Returns the handle to use for the query — the server may hand back an updated one.
     */
    private bindParameters;
    executeQuery(queryText: string, parameters?: any, headers?: {
        [key: string]: string;
    }): Promise<EventEmitter>;
}
