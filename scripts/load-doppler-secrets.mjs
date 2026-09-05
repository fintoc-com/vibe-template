// Cloud Run mounts the whole Doppler config as one JSON blob in DOPPLER_SECRETS;
// config/env.ts expects one variable per key. Values already in the environment win.
export function loadDopplerSecrets() {
  const blob = process.env.DOPPLER_SECRETS;
  if (!blob) return 0;

  let secrets;
  try {
    secrets = JSON.parse(blob);
  } catch (error) {
    throw new Error(`DOPPLER_SECRETS is not valid JSON: ${error.message}`);
  }

  let loaded = 0;
  for (const [key, value] of Object.entries(secrets)) {
    if (process.env[key] === undefined) {
      process.env[key] = String(value);
      loaded += 1;
    }
  }

  return loaded;
}
