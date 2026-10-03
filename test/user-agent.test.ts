import { platform } from "../src/platform/node";

describe("user-agent", () => {
    const matching_regex = /spice.js\/\d+\.\d+\.\d+ \((Linux|Windows|Darwin)\/[\d\w\.\-\_]+ (x86_64|aarch64|i386|arm64)\)/;

    it("should match the user-agent regex", async () => {
        const ua = platform.getUserAgent();
        expect(ua).toMatch(matching_regex);
    });
});
