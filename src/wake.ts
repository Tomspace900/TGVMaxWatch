import { sendWake } from './push.ts';

/** Lance par `collect.yml` apres le push du commit : la donnee est deja lisible. */
await sendWake();
