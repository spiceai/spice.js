import dotenv from "dotenv";
import { SpiceClient } from "../";
import "dotenv/config";

describe("cloud", () => {
  dotenv.config();

  const api_key = process.env.SPICEAI_API_KEY;

  if (!api_key) {
    throw "API_KEY environment variable not set";
  }

  const HTTP_DATA_PATH = process.env.HTTP_URL
    ? process.env.HTTP_URL
    : "https://data.spiceai.io";
  const FLIGHT_PATH = process.env.FLIGHT_URL
    ? process.env.FLIGHT_URL
    : "flight.spiceai.io:443";

  const client = new SpiceClient({
    apiKey: api_key,
    httpUrl: HTTP_DATA_PATH,
    flightUrl: FLIGHT_PATH,
  });

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  test("legacy client uses spice.ai cloud ", async () => {
    const client = new SpiceClient(api_key);

    const tableResult = await client.query(
      "SELECT * FROM spice.samples.taxi_trips LIMIT 10;",
    );

    expect(tableResult.toArray()).toHaveLength(10);
  });

  test("streaming works", async () => {
    let numChunks = 0;
    await client.query(
      "SELECT * FROM spice.samples.taxi_trips LIMIT 10;",
      (table) => {
        expect(table.toArray().length).toBeLessThanOrEqual(10);

        let trip_distance = table.getChild("trip_distance");
        expect(trip_distance).toBeTruthy();
        numChunks++;
      },
    );
    expect(numChunks).toBeGreaterThanOrEqual(1);
    expect(numChunks).toBeLessThanOrEqual(3);
  }, 10000);

  test("full result works", async () => {
    const tableResult = await client.query(
      "SELECT * FROM spice.samples.taxi_trips LIMIT 10;",
    );
    expect(tableResult.toArray()).toHaveLength(10);
  }, 30000);
});
