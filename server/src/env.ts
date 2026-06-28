// Loads server/.env into process.env. Imported first (before any module that
// reads env vars such as CLAUDE_CODE_OAUTH_TOKEN or DATA_DIR).
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // .env is optional; fall back to the ambient environment.
}
