const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
import { EventEmitter } from "stream";
import { Table, tableFromIPC } from "apache-arrow";
import { StreamingQuery } from "./streaming_query";
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

class Client {
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

  public async streaming_query(queryText: string): Promise<StreamingQuery> {
    let client: FlightClient;
    const do_get = await this.getResultStream(queryText, (c: FlightClient) => {
      client = c;
    });

    do_get.on("status", (response: FlightStatus) => {
      client.close();
    });

    return new StreamingQuery(do_get);
  }

  public async query(queryText: string): Promise<Table> {
    let client: FlightClient;
    const do_get = await this.getResultStream(queryText, (c: FlightClient) => {
      client = c;
    });

    let chunks: Buffer[] = [];
    do_get.on("data", (response: FlightData) => {
      chunks.push(getIpcMessage(response));
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

export { Client };
