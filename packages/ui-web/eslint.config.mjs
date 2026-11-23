import webConfig from '../../web/eslint.config.mjs';

export default [
  ...webConfig,
  { settings: { next: { rootDir: '../../web/' } } },
];
