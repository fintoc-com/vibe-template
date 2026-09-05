import { loadDopplerSecrets } from './load-doppler-secrets.mjs';

loadDopplerSecrets();

await import('../server.js');
