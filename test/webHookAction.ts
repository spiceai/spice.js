import listenForWebhookMessage from "./ws";

const RELAY_BUCKETS = ["spice.js"];

const webHookAction = (fn: () => void): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      let ws = await listenForWebhookMessage(RELAY_BUCKETS, (body: string) => {
        // close the websocket
        ws.close();

        // resolve the promise after a short delay as a workaround to ensure that the websocket is
        // fully closed before the test ends and can be used again
        setTimeout(() => {
          resolve(body);
        }, 500);
      });

      fn();
    } catch (e) {
      reject(e);
    }
  });

  // could be improved by adding timeout+closing ws in this case by using Promise.race
};

export { webHookAction };
