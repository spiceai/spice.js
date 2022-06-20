const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
import { EventEmitter } from "stream";
import { Table, tableFromIPC } from "apache-arrow";
import {
  FlightClient,
  FlightData,
  FlightStatus,
  FlightInfo,
  DescriptorType,
  Ticket,
  getIpcMessage,
} from "./flight";

const PROTO_PATH = "./proto/Flight.proto";
const fullProtoPath = path.join(__dirname, PROTO_PATH);
let packageDefinition = protoLoader.loadSync(fullProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
let flight_proto =
  grpc.loadPackageDefinition(packageDefinition).arrow.flight.protocol;

class SpiceClient {
  private _apiKey: string;
  private _url: string;
  public constructor(apiKey: string, url: string = "flight.spiceai.io:443") {
    this._apiKey = apiKey;
    this._url = url;
  }

  private createClient(meta: any): any {
    const creds = grpc.credentials.createSsl();
    const metaCallback = (_params: any, callback: any) => {
      callback(null, meta);
    };
    const callCreds =
      grpc.credentials.createFromMetadataGenerator(metaCallback);
    const combCreds = grpc.credentials.combineChannelCredentials(
      creds,
      callCreds
    );
    return new flight_proto.FlightService(this._url, combCreds);
  }

  private async getResultStream(
    queryText: string,
    getFlightClient: ((client: FlightClient) => void) | undefined = undefined
  ): Promise<EventEmitter> {
    const meta = new grpc.Metadata();
    const client: FlightClient = this.createClient(meta);
    meta.set("authorization", "Bearer " + this._apiKey);

    let queryBuff = Buffer.from(queryText, "utf8");

    let flightTicket = await new Promise<Ticket>((resolve, reject) => {
      // GetFlightInfo returns FlightInfo that have endpoints with ticket to call DoGet with
      client.GetFlightInfo(
        { type: DescriptorType.CMD, cmd: queryBuff },
        (err: any, result: FlightInfo) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result.endpoint[0].ticket);
        }
      );
    });

    if (getFlightClient) {
      getFlightClient(client);
    }
    // DoGet return a stream of FlightData
    return client.DoGet(flightTicket);
  }

  public async query(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined
  ): Promise<Table> {
    let client: FlightClient;
    const do_get = await this.getResultStream(queryText, (c: FlightClient) => {
      client = c;
    });

    let schema: Buffer | undefined;
    let chunks: Buffer[] = [];
    do_get.on("data", (response: FlightData) => {
      let ipcMessage = getIpcMessage(response);
      chunks.push(ipcMessage);
      if (!schema) {
        schema = ipcMessage;
      } else if (onData) {
        onData(tableFromIPC([schema, ipcMessage]));
      }
    });

    return new Promise((resolve, reject) => {
      do_get.on("status", (response: FlightStatus) => {
        const table = tableFromIPC(chunks);
        client.close();
        resolve(table);
      });
    });
  }
}

export { SpiceClient };
