# Important Rules

- Don't create comments for getters and setters. It's a waste of space.
- Use JSDoc type definitions as much as possible. Declare new types if needed
- If there are multiple implementation options, ask the user which one to implement
- Keep things DRY: Don't repeat yourself. 
- Keep things stupid simple: Prefer simple solutions over complex ones.
- Keep the code as simple as possible. Don't implement workarounds and fallbacks if not strictly necessary.
- Use the `gh` CLI tool to inspect broken workflow runs
- Please write temp files into the project itself, since write operations outside of the repo can not be auto approved. Write them into a `temp/` directory and ignore that directory in git. You can use these temp files to store data between iterations.
- Don't skip tests, just to enable a release. If a test is failing, it's very likely for a good reason.
- Keep summaries and explanations concise. Focus on the most important information and avoid unnecessary details.
- **ESM wrapper**: `packages/node/scripts/bundle-node-package.mjs` writes `build/node/index.js` (and `electron.js`) as hardcoded string arrays. Any named export added to `packages/node/src/index.ts` must also be added to that array, otherwise it is silently missing from the ESM entry point even though it exists in the CJS bundle. The build script overwrites the file every run, so manual edits to `build/node/index.js` are lost.
- **ONNX session cleanup**: After tests complete, do NOT call `process.exit()` while onnxruntime-node is loaded. `process.exit()` forces a C++ shutdown that races with onnxruntime's thread-pool teardown, causing `libc++abi: mutex lock failed: Invalid argument` even after calling `session.release()`. The only reliable fix is to let the Node.js event loop drain naturally: set `process.exitCode`, clear all intervals/timers, disconnect any open handles (e.g. device connections), and call `releaseAll()`. Verified: create+release+process.exit() → crash; create+release+natural drain → clean exit.