import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { wakeDevice } from '../src/push.ts';

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

describe('envoi via Expo Push', () => {
  /*
   * Un reveil n'affiche rien : un titre, un corps ou un canal en feraient un
   * message que le systeme montre lui-meme, et la tache de l'application —
   * seule a connaitre ce qu'on suit — ne tournerait jamais.
   */
  it('envoie un reveil silencieux, sans rien a afficher', async () => {
    reset();
    await wakeDevice('ExponentPushToken[abc]');

    assert.equal(received.length, 1);
    const body = received[0]!.body as Record<string, unknown>;
    assert.equal(body['to'], 'ExponentPushToken[abc]');
    assert.equal(body['priority'], 'high');
    for (const shown of ['title', 'body', 'channelId']) assert.equal(body[shown], undefined);
    assert.ok(body['data']);
  });

  it('signe la requete quand EXPO_TOKEN est defini', async () => {
    // Le jeton de notification est public dans le depot : sans signature,
    // n'importe qui pourrait pousser vers l'appareil.
    reset();
    process.env['EXPO_TOKEN'] = 'secret-de-test';
    await wakeDevice('ExponentPushToken[abc]');
    assert.equal(received[0]?.authorization, 'Bearer secret-de-test');

    reset();
    process.env['EXPO_TOKEN'] = '   ';
    await wakeDevice('ExponentPushToken[abc]');
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
      () => wakeDevice('ExponentPushToken[mort]'),
      /DeviceNotRegistered/,
    );
  });

  it('rejoue apres une erreur temporaire', async () => {
    reset([
      { status: 429, body: {} },
      { status: 503, body: {} },
      { status: 200, body: { data: { status: 'ok', id: 'x' } } },
    ]);

    await wakeDevice('ExponentPushToken[abc]');
    assert.equal(received.length, 3);
  });

  it('ne rejoue pas une requete refusee sur le fond', async () => {
    reset([{ status: 400, body: { errors: [{ message: 'payload malforme' }] } }]);

    await assert.rejects(() => wakeDevice('ExponentPushToken[abc]'), /refusee/);
    // Une seule tentative : rejouer un payload invalide ne le rendra pas valide.
    assert.equal(received.length, 1);
  });
});
