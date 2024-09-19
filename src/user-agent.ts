import os from "os";
import { VERSION } from "./version";

export function getUserAgent(): string {
    const os_type = os.type();
    const os_release = os.release();
    const os_arch = os.machine();
    return `spice.js ${VERSION} (${os_type}/${os_release} ${os_arch})`;
}