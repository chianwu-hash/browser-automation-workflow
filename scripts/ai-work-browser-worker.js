'use strict';
// IPC gate: register the real PID before any browser action.
process.once('message', ({ script, args }) => {
  process.disconnect();
  process.argv = [process.execPath, script, ...args];
  require(script);
});
