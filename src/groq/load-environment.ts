import { config } from 'dotenv';

/** Loads the local server-side credential without exposing it to the browser bundle. */
export function loadLocalGroqEnvironment(): boolean {
  config({ path: '.env.local', override: false, quiet: true });
  return Boolean(process.env.GROQ_API_KEY);
}
