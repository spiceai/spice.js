import { SpiceClient } from "../";

describe("local", () => {
  const client = new SpiceClient();

  it("connection and query to local spice runtime works", async () => {
    const tableResult = await client.query(
      "SELECT * FROM test_postgresql_table_not_accelerated LIMIT 3",
    );

    expect(tableResult.toArray()).toHaveLength(3);
  });
});
