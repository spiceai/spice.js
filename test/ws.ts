import dotenv from 'dotenv';
import { WebSocket } from 'ws';

const server = 'wss://my.webhookrelay.com/v1/socket';

dotenv.config();

const relayKey = process.env.RELAY_KEY;
if (!relayKey) {
  throw 'RELAY_KEY environment variable not set';
}
const relaySecret = process.env.RELAY_SECRET;
if (!relaySecret) {
  throw 'RELAY_SECRET environment variable not set';
}

const listenForWebhookMessage = (
  buckets: string[],
  onMessage: (body: string) => Promise<void>
): WebSocket => {
  const ws = new WebSocket(server);
  ws.on('open', function () {
    console.log('web socket connected, sending authentication request');
    ws.send(
      JSON.stringify({ action: 'auth', key: relayKey, secret: relaySecret })
    );
  });

  ws.on('message', function (data: string) {
    const msg = JSON.parse(data.toString());
    switch (msg.type) {
      case 'status': {
        console.log('[info] web socket status message received', msg);
        switch (msg.status) {
          case 'unauthorized': {
            throw 'web socket unauthorized. Set RELAY_KEY and RELAY_SECRET environment variables.';
          }
          case 'authenticated': {
            ws.send(JSON.stringify({ action: 'subscribe', buckets: buckets }));
            break;
          }
          case 'ping': {
            ws.pong();
            break;
          }
        }
        break;
      }
      case 'webhook': {
        onMessage(msg.body);
        break;
      }
      default: {
        console.log('[info] web socket message received', msg);
      }
    }
  });

  ws.on('error', function (e) {
    console.error('web socket error', e);
  });

  ws.on('close', function (e) {
    console.log('web socket closed', e);
  });

  return ws;
};

export default listenForWebhookMessage;
