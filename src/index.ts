const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
import { Table, tableFromIPC } from "apache-arrow";
import { resolve } from "path";

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
  public constructor(apiKey: string) {
    this._apiKey = apiKey;
  }

  private createClient(meta: any): any {
    const creds = grpc.credentials.createSsl();
    meta.add(
      "authorization",
      "Basic " + Buffer.from(":" + this._apiKey, "utf8").toString("base64")
    );
    const metaCallback = (_params: any, callback: any) => {
      callback(null, meta);
    };
    const callCreds =
      grpc.credentials.createFromMetadataGenerator(metaCallback);
    const combCreds = grpc.credentials.combineChannelCredentials(
      creds,
      callCreds
    );
    return new flight_proto.FlightService("flight.spiceai.io:443", combCreds);
  }

  public async query(queryText: string): Promise<Table> {
    const meta = new grpc.Metadata();
    const client = this.createClient(meta);
    return new Promise((resolve, reject) => {
      // Handshake send a stream of HandshakeRequest and return a stream of HandshakeResponse
      // returning streams requires to managed event like data and status
      // the handshake is is simple so there is no need to send data
      const handshake = client.Handshake();
      handshake.on("status", (result: any) => {
        resolve(result.metadata.get("authorization")[0]);
      });
      handshake.end();
    }).then((token) => {
      // Updating header to include recieved token (needed for subsequent calls)
      meta.set("authorization", token);

      let queryBuff = Buffer.from(queryText, "utf8");

      return new Promise((resolve, reject) => {
        // GetFlightInfo returns FlightInfo that have endpoints with ticket to call DoGet with
        client.GetFlightInfo(
          { type: 2, cmd: queryBuff },
          (err: any, result: any) => {
            if (err) {
              reject(err);
              return;
            }

            // DoGet return a stream of FlightData
            const do_get = client.DoGet(result.endpoint[0].ticket);

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

            do_get.on("status", (response: any) => {
              const table = tableFromIPC(data_buffers);
              client.close();
              resolve(table);
            });
          }
        );
      });
    });
  }
}

export { Client };
