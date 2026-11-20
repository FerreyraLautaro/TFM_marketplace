import { parse } from 'node:path';
import { TEST_DATABASE } from './utils/test-database';

// Runs before each test file imports AppModule. ConfigModule.forRoot reads the
// environment at import time and runtime variables win over .env.
process.env.NODE_ENV = 'test';
process.env.POSTGRES_DB = TEST_DATABASE;

// On Windows, Jest resolves module paths with an upper-case drive letter while
// the shell may start in "c:\". TypeORM globs the migrations relative to the cwd
// and that casing mismatch yields an invalid path. Changing to the same directory
// keeps the old casing, so step through the drive root to apply the new one.
const cwd = process.cwd();
if (/^[a-z]:/.test(cwd)) {
  const target = cwd.charAt(0).toUpperCase() + cwd.slice(1);
  process.chdir(parse(target).root);
  process.chdir(target);
}
