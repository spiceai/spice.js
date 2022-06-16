const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
import { Schema, tableFromIPC } from "apache-arrow";

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("API key required as argument");
    return;
  }
  const api_key = args[0];

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

  const creds = grpc.credentials.createSsl();
  const meta = new grpc.Metadata();
  meta.add(
    "authorization",
    "Basic " + Buffer.from(":" + api_key, "utf8").toString("base64")
  );
  const metaCallback = (_params: any, callback: any) => {
    callback(null, meta);
  };
  const callCreds = grpc.credentials.createFromMetadataGenerator(metaCallback);
  const combCreds = grpc.credentials.combineChannelCredentials(
    creds,
    callCreds
  );
  const client = new flight_proto.FlightService(
    "flight.spiceai.io:443",
    combCreds
  );

  new Promise((resolve, reject) => {
    // Handshake send a stream of HandshakeRequest and return a stream of HandshakeResponse
    // returning streams requires to managed event like data and status
    // the handshake is is simple so there is no need to send data
    const handshake = client.Handshake();
    // handshake.on("end", () => {
    // 	console.log("end");
    // 	resolve(metadata);
    // });
    handshake.on("status", (result: any) => {
      resolve(result.metadata.get("authorization")[0]);
    });
    handshake.end();
  })
    .then((token) => {
      // Updating header to include recieved token (needed for subsequent calls)
      meta.set("authorization", token);

      let queryBuff = Buffer.from(
        'SELECT number, "hash" FROM eth.recent_blocks LIMIT 3;',
        "utf8"
      );

      // GetSchema is a simple calls that retrieve the data directly (no stream)
      client.GetSchema({ type: 2, cmd: queryBuff }, (err: any, result: any) => {
        console.log("GetSchema");
        if (!result) {
          return;
        }
        let table = tableFromIPC(result.schema);
        console.log(table.schema.fields);
      });

      // GetFlightInfo returns FlightInfo that have endpoints with ticket to call DoGet with
      let schema: Schema | null = null;
      client.GetFlightInfo(
        { type: 2, cmd: queryBuff },
        (err: any, result: any) => {
          console.log("GetFlightInfo");
          if (err === null) {
            console.log("Starting DoGet");
            let chunks: any[] = [];

            // DoGet return a stream of FlightData
            const do_get = client.DoGet(result.endpoint[0].ticket);
            do_get.on("status", (response: any) => {
              console.log("status");
              console.log(response);
              client.close();
            });
            do_get.on("data", (response: any) => {
              console.log("data");
              console.log(response);
              let header_size_buff = Buffer.alloc(4);
              header_size_buff.writeUInt32LE(response.data_header.length, 0);

              if (schema === null) {
                console.log("Reading schema");
                let buff = Buffer.concat([
                  header_size_buff,
                  response.data_header,
                  response.data_body,
                ]);
                schema = tableFromIPC(buff).schema;
                console.log(schema.fields);
              }
              // else {
              // 	console.log("Reading data");
              // 	let buff = Buffer.concat([
              // 		Buffer.from("ffffffff", "hex"), // Continuation token
              // 		header_size_buff,
              // 		response.data_header,
              // 		response.data_body]);
              // }
            });
          }
        }
      );
    })
    .catch((error) => {
      console.error("error while GetFlightInfo");
      console.log(error);
      throw error;
    });
  // client.close();
}

main();
