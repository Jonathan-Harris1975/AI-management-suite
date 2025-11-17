import log from ;
// scripts/startupCheck.js
import { info, error } from ;

try {
  info();
  info();
  info(`📂 Working directory: ${process.cwd()}`);
  info(`📦 Node version: ${process.version}`);
  info();
  info();
  info();
  process.exit(0);
} catch (err) {
  error(, { error: err });
  process.exit(1);
}
