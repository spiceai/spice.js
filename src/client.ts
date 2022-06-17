const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
import { Table, tableFromIPC } from "apache-arrow";

const PROTO_PATH = "./proto/Flight.proto";
let packageDefinition = protoLoader.loadSync(PROTO_PATH, {
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

  public async query(queryText: string): Promise<Table> {
    const meta = new grpc.Metadata();
    const client = this.createClient(meta);
    meta.set("authorization", "Bearer " + this._apiKey);

    let queryBuff = Buffer.from(queryText, "utf8");

    let flightTicket = await new Promise((resolve, reject) => {
      // GetFlightInfo returns FlightInfo that have endpoints with ticket to call DoGet with
      client.GetFlightInfo(
        { type: 2, cmd: queryBuff },
        (err: any, result: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result.endpoint[0].ticket);
        }
      );
    });

    // DoGet return a stream of FlightData
    const do_get = client.DoGet(flightTicket);

    let data_buffers: Buffer;
    do_get.on("data", (response: any) => {
      let header_size_buff = Buffer.alloc(4);
      header_size_buff.writeUInt32LE(response.data_header.length, 0);

      if (!data_buffers || data_buffers.byteLength === 0) {
        data_buffers = Buffer.concat([
          header_size_buff,
          response.data_header,
          response.data_body,
        ]);
      } else {
        data_buffers = Buffer.concat([
          data_buffers,
          Buffer.from("FFFFFFFF", "hex"), // Continuation token
          header_size_buff,
          response.data_header,
          response.data_body,
        ]);
      }
    });

    return new Promise((resolve, reject) => {
      do_get.on("status", (response: any) => {
        const table = tableFromIPC(data_buffers);
        client.close();
        resolve(table);
      });
    });
  }
}

export { Client };
