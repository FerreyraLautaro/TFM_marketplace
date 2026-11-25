import { TEST_DATABASE } from './utils/test-database';
import { TEST_WEBHOOK_SECRET } from './utils/webhook-secret';

// Runs before each test file imports AppModule. ConfigModule.forRoot reads the
// environment at import time and runtime variables win over .env.
process.env.NODE_ENV = 'test';
process.env.POSTGRES_DB = TEST_DATABASE;
process.env.PAYMENT_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
