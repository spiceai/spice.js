"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIpcMessage = exports.DescriptorType = void 0;
var DescriptorType;
(function (DescriptorType) {
    DescriptorType[DescriptorType["UNKNOWN"] = 0] = "UNKNOWN";
    DescriptorType[DescriptorType["PATH"] = 1] = "PATH";
    DescriptorType[DescriptorType["CMD"] = 2] = "CMD";
})(DescriptorType || (exports.DescriptorType = DescriptorType = {}));
const getIpcMessage = (flightData) => {
    let headerBuffer = Buffer.alloc(4);
    headerBuffer.writeUInt32LE(flightData.dataHeader.length, 0);
    return Buffer.concat([
        headerBuffer,
        flightData.dataHeader,
        flightData.dataBody,
    ]);
};
exports.getIpcMessage = getIpcMessage;
//# sourceMappingURL=flight.js.map