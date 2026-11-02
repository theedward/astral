// Keep OS credential prompts off Electron's UI thread. Never fall back to plaintext.
function create(storage, { platform = process.platform, timeoutMs = 10000 } = {}) {
  const unavailable =
    platform === 'darwin'
      ? 'Unlock macOS Keychain, then try again.'
      : 'Saved sign-in is unavailable. Try signing in again.';
  async function bounded(operation) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(unavailable)), timeoutMs);
        }),
      ]);
    } catch {
      throw Error(unavailable);
    } finally {
      clearTimeout(timer);
    }
  }
  async function ready() {
    if (!(await storage.isAsyncEncryptionAvailable())) throw Error(unavailable);
  }
  return {
    available: () => bounded(ready),
    encrypt: (text) =>
      bounded(async () => {
        await ready();
        return (await storage.encryptStringAsync(text)).toString('base64');
      }),
    decrypt: (encoded) =>
      bounded(async () => {
        await ready();
        const value = await storage.decryptStringAsync(Buffer.from(encoded, 'base64'));
        if (typeof value?.result !== 'string' || !value.result) throw Error(unavailable);
        return value.result;
      }),
  };
}
module.exports = { create };
