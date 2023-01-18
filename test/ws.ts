import { WebSocket } from 'ws';

const server = 'wss://my.webhookrelay.com/v1/socket';

const apiKey = process.env.RELAY_KEY;
if (!apiKey) {
  throw 'RELAY_KEY environment variable not set';
}
const apiSecret = process.env.RELAY_SECRET;
if (!apiSecret) {
  throw 'RELAY_SECRET environment variable not set';
}

const listenForWebhookMessage = (
  buckets: string[],
  onMessage: (body: string) => Promise<void>
): WebSocket => {
  const ws = new WebSocket(server);
  ws.on('open', function () {
    console.log('web socket connected, sending authentication request');
    ws.send(JSON.stringify({ action: 'auth', key: apiKey, secret: apiSecret }));
  });

  ws.on('message', function (data: string) {
    const msg = JSON.parse(data);
    if (msg.type === 'status') {
      if (msg.status === 'unauthorized') {
        throw 'web socket unauthorized. Set RELAY_KEY and RELAY_SECRET environment variables.';
      } else if (msg.status === 'authenticated') {
        ws.send(JSON.stringify({ action: 'subscribe', buckets: buckets }));
      }
    } else if (msg.type === 'webhook') {
      onMessage(msg.body);
    }
  });

  ws.on('error', function (e) {
    console.error('web socket error', e);
  });

  return ws;
};

export default listenForWebhookMessage;
