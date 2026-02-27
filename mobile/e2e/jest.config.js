module.exports = {
  testTimeout: Number(process.env.DETOX_TEST_TIMEOUT_MS ?? "480000"),
  maxWorkers: 1,
  testMatch: ["**/*.e2e.js"],
  reporters: ["detox/runners/jest/reporter"],
  testEnvironment: "detox/runners/jest/testEnvironment",
  setupFilesAfterEnv: ["./init.js"],
  verbose: true
};
