import { EventEmitter } from "stream";

enum DescriptorType {
  UNKNOWN = 0,
  PATH = 1,
  CMD = 2,
}

type FlightDescriptor = {
  type: DescriptorType;
  cmd?: Buffer;
  path?: string[];
};

type Ticket = {
  ticket: Buffer;
};

type Location = {
  uri: string;
};

type FlightEndpoint = {
  ticket: Ticket;
  location: Location[];
};

type FlightInfo = {
  schema: Buffer;
  flight_descriptor: FlightDescriptor;
  endpoint: FlightEndpoint[];
  total_records: number;
  total_bytes: number;
};

type FlightData = {
  data_header: Buffer;
  app_metadata: Buffer;
  data_body: Buffer;
};

type FlightStatus = {
  code: number;
  details: string;
};

type FlightClient = {
  DoGet: (ticket: Ticket) => EventEmitter;
  GetFlightInfo: (
    descriptor: FlightDescriptor,
    callback: (err: any, result: FlightInfo) => void
  ) => void;
  close: () => void;
};

const getIpcMessage = (flightData: FlightData): Buffer => {
  let header_size_buff = Buffer.alloc(4);
  header_size_buff.writeUInt32LE(flightData.data_header.length, 0);

  return Buffer.concat([
    header_size_buff,
    flightData.data_header,
    flightData.data_body,
  ]);
};

export {
  FlightClient,
  FlightData,
  FlightStatus,
  FlightInfo,
  FlightDescriptor,
  DescriptorType,
  Ticket,
  getIpcMessage,
};
