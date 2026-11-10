// One-time local setup, run with `npm run setup` after `npm install`: creates server/.env and applies migrations.
import { copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const envFile = new URL('../server/.env', import.meta.url);
if (existsSync(envFile)) {
  console.log('server/.env already exists, keeping it.');
} else {
  copyFileSync(new URL('../server/.env.example', import.meta.url), envFile);
  console.log('Created server/.env from server/.env.example. Check DATABASE_URL in it.');
}

try {
  execSync('npm run db:deploy --workspace=server', { stdio: 'inherit' });
} catch {
  console.error(`
Could not apply migrations: is PostgreSQL running, and does DATABASE_URL in server/.env point at it?
See "Getting Started" in README.md for how to install PostgreSQL, then run \`npm run setup\` again.`);
  process.exit(1);
}

console.log('\nSetup done. Start the app with `npm run dev` and open http://localhost:5173');
