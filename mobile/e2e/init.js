const { device } = require("detox");

const DETOX_TIMEOUT_MS = Number(process.env.DETOX_TEST_TIMEOUT_MS ?? "480000");
jest.setTimeout(DETOX_TIMEOUT_MS);

beforeEach(async () => {
  await device.launchApp({
    newInstance: true
  });
});
