"use strict"

// import grpc from "@grpc/grpc-js"
// import { CallMetadataOptions } from "@grpc/grpc-js/src/call-credentials"
// import protoLoader from "@grpc/proto-loader";
const grpc = require("@grpc/grpc-js")
const protoLoader = require("@grpc/proto-loader");

function main() {
	const PROTO_PATH = "./proto/Flight.proto";
	let packageDefinition = protoLoader.loadSync(
		PROTO_PATH,
		{
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true
		});
	let flight_proto = grpc.loadPackageDefinition(packageDefinition).arrow.flight.protocol;

	const creds = grpc.credentials.createSsl();
	const meta = new grpc.Metadata();
	meta.add('authorization', 'Basic ' + Buffer.from(":3031|abcd", "utf8").toString("base64"));
	const metaCallback = (_params: any, callback: any) => {
		callback(null, meta);
	}
	const callCreds = grpc.credentials.createFromMetadataGenerator(metaCallback);
	const combCreds = grpc.credentials.combineChannelCredentials(creds, callCreds);
	const client = new flight_proto.FlightService("flight.spiceai.io:443", combCreds);

	new Promise((resolve, reject) => {
		const handshake = client.Handshake();
			// handshake.on("end", () => {
			// 	console.log("end");
			// 	resolve(metadata);
			// });
			handshake.on("status", (result: any) => {
				resolve(result.metadata.get("authorization")[0]);
			});
			handshake.end();
	}).then( (token) => {
		let queryBuff = Buffer.from("SELECT * FROM eth.recent_blocks;", "utf8");
		client.GetFlightInfo({type: 2, cmd: queryBuff}, (err: any, result: any) => {
			console.log("GetFlightInfo");
			console.log(err);
			console.log(result);
		});
	})
	// client.close();
}

main();