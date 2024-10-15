import os from "os";
import { VERSION } from "./version";

export function getUserAgent(): string {
    const osType = os.type();
    const osRelease = os.release();
    const osArch = os.machine();
    return `spice.js ${VERSION} (${osType}/${osRelease} ${osArch})`;
}