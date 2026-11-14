// Preloaded into Foundry's Electron binary run as Node (ELECTRON_RUN_AS_NODE): hides the
// Electron version so the server starts as a plain Node server without desktop window APIs.
const versionen = { ...process.versions };
delete versionen.electron;
Object.defineProperty(process, "versions", { value: versionen });
