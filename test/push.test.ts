import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { sendToExpo } from '../src/push.ts';

interface Recorded {
  authorization?: string;
  body: unknown;
}

let server: Server;
let port = 0;
let received: Recorded[] = [];
/** Reponses servies dans l'ordre, une par requete. */
let responses: { status: number; body: unknown }[] = [];

before(async () => {
  server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      received.push({
        authorization: request.headers.authorization,
        body: JSON.parse(raw),
      });
      const next = responses.shift() ?? { status: 200, body: { data: { status: 'ok', id: 'x' } } };
      response.writeHead(next.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(next.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
  process.env['TGVMAX_PUSH_URL'] = `http://127.0.0.1:${port}/send`;
});

after(() => server.close());

function reset(next: { status: number; body: unknown }[] = []) {
  received = [];
  responses = next;
}

const NOTIFICATION = {
  title: '3 places ouvertes',
  body: '17/10 16:12 n8441 2h14',
  url: 'https://example.test/?date=2026-10-17&dir=FRPMO%3EFRBOJ',
  tag: 'tgvmax',
};

describe('envoi via Expo Push', () => {
  it('envoie le jeton, le canal et le lien', async () => {
    reset();
    await sendToExpo(NOTIFICATION, 'ExponentPushToken[abc]');

    assert.equal(received.length, 1);
    const body = received[0]!.body as Record<string, unknown>;
    assert.equal(body['to'], 'ExponentPushToken[abc]');
    assert.equal(body['title'], NOTIFICATION.title);
    // Le canal doit exister cote application, sinon Android n'affiche rien.
    assert.equal(body['channelId'], 'alerts');
    // Le lien porte la date : taper la notification doit ouvrir le bon jour.
    assert.deepEqual(body['data'], { url: NOTIFICATION.url });
  });

  it('signe la requete quand EXPO_TOKEN est defini', async () => {
    // Le jeton de notification est public dans le depot : sans signature,
    // n'importe qui pourrait pousser vers l'appareil.
    reset();
    process.env['EXPO_TOKEN'] = 'secret-de-test';
    await sendToExpo(NOTIFICATION, 'ExponentPushToken[abc]');
    assert.equal(received[0]?.authorization, 'Bearer secret-de-test');

    reset();
    process.env['EXPO_TOKEN'] = '   ';
    await sendToExpo(NOTIFICATION, 'ExponentPushToken[abc]');
    assert.equal(received[0]?.authorization, undefined);
    delete process.env['EXPO_TOKEN'];
  });

  it('echoue bruyamment sur un appareil desinscrit', async () => {
    // Application desinstallee ou permission retiree : le canal d'alerte est
    // mort, et le mail d'echec de GitHub devient le seul canal de secours.
    reset([
      {
        status: 200,
        body: {
          data: {
            status: 'error',
            message: 'not a registered push notification recipient',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      },
    ]);

    await assert.rejects(
      () => sendToExpo(NOTIFICATION, 'ExponentPushToken[mort]'),
      /DeviceNotRegistered/,
    );
  });

  it('rejoue apres une erreur temporaire', async () => {
    reset([
      { status: 429, body: {} },
      { status: 503, body: {} },
      { status: 200, body: { data: { status: 'ok', id: 'x' } } },
    ]);

    await sendToExpo(NOTIFICATION, 'ExponentPushToken[abc]');
    assert.equal(received.length, 3);
  });

  it('ne rejoue pas une requete refusee sur le fond', async () => {
    reset([{ status: 400, body: { errors: [{ message: 'payload malforme' }] } }]);

    await assert.rejects(() => sendToExpo(NOTIFICATION, 'ExponentPushToken[abc]'), /refusee/);
    // Une seule tentative : rejouer un payload invalide ne le rendra pas valide.
    assert.equal(received.length, 1);
  });
});
