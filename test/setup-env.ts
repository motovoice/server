// Deterministic environment for every test file. Runs before the test file
// imports any app module, because several modules read env at import time.
process.env.LOG_LEVEL = 'silent';
process.env.LIVEKIT_URL = 'wss://livekit.test.invalid';
process.env.LIVEKIT_API_KEY = 'test_key';
process.env.LIVEKIT_API_SECRET = 'test_secret_that_is_long_enough_for_hs256';

// Optional features are off by default; tests enable them with vi.stubEnv.
delete process.env.SERVER_PASSWORD;
delete process.env.STATS_TOKEN;
delete process.env.PUBLIC_URL;
