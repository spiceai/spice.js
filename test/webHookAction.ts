import listenForWebhookMessage from "./ws";

const RELAY_BUCKETS = ['spice.js'];

export async function webHookAction(fn: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            let ws = listenForWebhookMessage(RELAY_BUCKETS, (body: string) => {
                // close the websocket
                ws.close();
                
                // resolve the promise after a short delay
                setTimeout(() => {
                    try {
                        resolve(body);
                    } catch (e) {
                        reject(e);
                    }
                }, 500);
            });

            // invoke action that should trigger a webhook after a short delay to make sure websocket is subscribed
            setTimeout(() => {
                fn();
            }, 2000);

        } catch (e) {
            reject(e);
        }
    });

    // could be improved by adding timeout using Promise.race 
}