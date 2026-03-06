const { device } = require("detox");

const DETOX_TIMEOUT_MS = Number(process.env.DETOX_TEST_TIMEOUT_MS ?? "480000");
const DETOX_NEW_INSTANCE_PER_TEST = /^(1|true)$/i.test(
  process.env.DETOX_NEW_INSTANCE_PER_TEST ?? "false"
);
const DETOX_RELOAD_REACT_NATIVE = !/^(0|false)$/i.test(
  process.env.DETOX_RELOAD_REACT_NATIVE ?? "true"
);

jest.setTimeout(DETOX_TIMEOUT_MS);

beforeAll(async () => {
  await device.launchApp({
    newInstance: true,
    delete: true
  });
});

beforeEach(async () => {
  if (DETOX_NEW_INSTANCE_PER_TEST) {
    await device.launchApp({
      newInstance: true
    });
    return;
  }

  if (DETOX_RELOAD_REACT_NATIVE) {
    await device.reloadReactNative();
    return;
  }

  await device.launchApp({
    newInstance: false
  });
});
