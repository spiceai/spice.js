import { Table, tableFromIPC } from "apache-arrow";
import { EventEmitter } from "stream";
import { FlightData, getIpcMessage } from "./flight";

export class StreamingQuery {
  private _doGetEmitter: EventEmitter;
  private _schema: Buffer | undefined;

  constructor(doGetEmitter: EventEmitter) {
    this._doGetEmitter = doGetEmitter;
  }

  public onData(callback: (data: Table) => void) {
    this._doGetEmitter.on("data", (response: FlightData) => {
      let ipcMessage = getIpcMessage(response);

      if (!this._schema) {
        this._schema = ipcMessage;
      } else {
        let table = tableFromIPC(Buffer.concat([this._schema, ipcMessage]));
        callback(table);
      }
    });
  }

  public onEnd(cb: () => void) {
    this._doGetEmitter.on("status", (status: any) => {
      cb();
    });
  }
}
