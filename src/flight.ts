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
  flightDescriptor: FlightDescriptor;
  endpoint: FlightEndpoint[];
  totalRecords: number;
  totalBytes: number;
};

type FlightData = {
  dataHeader: Buffer;
  appMetadata: Buffer;
  dataBody: Buffer;
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
  let headerBuffer = Buffer.alloc(4);
  headerBuffer.writeUInt32LE(flightData.dataHeader.length, 0);

  return Buffer.concat([
    headerBuffer,
    flightData.dataHeader,
    flightData.dataBody,
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
