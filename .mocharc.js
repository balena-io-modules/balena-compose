module.exports = {
  timeout: 25000,
  spec: 'test/**/*.spec.ts',
  // TODO: This shouldn't be necessary, but the tests on node20 hang, while they pass on node 16 & 18.
  // `leaked-handles` showed an unclosed docker deamon connection.
  exit: true,
};
