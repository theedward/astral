import test from 'node:test';
import assert from 'node:assert/strict';
import credentials from '../desktop/credentials.cjs';
test('credential access uses only asynchronous OS encryption and supports existing ciphertext', async () => {
  const oldCiphertext = Buffer.from('legacy-encrypted-fixture');
  const storage = {
    isAsyncEncryptionAvailable: async () => true,
    decryptStringAsync: async (value) => {
      assert.deepEqual(value, oldCiphertext);
      return { result: 'test-session', shouldReEncrypt: true };
    },
    encryptStringAsync: async (value) => {
      assert.equal(value, 'test-session');
      return Buffer.from('new-encrypted-fixture');
    },
    isEncryptionAvailable: () => {
      throw Error('Must not use a blocking API');
    },
    decryptString: () => {
      throw Error('Must not use a blocking API');
    },
    encryptString: () => {
      throw Error('Must not use a blocking API');
    },
  };
  const c = credentials.create(storage);
  assert.equal(await c.decrypt(oldCiphertext.toString('base64')), 'test-session');
  assert.equal(
    await c.encrypt('test-session'),
    Buffer.from('new-encrypted-fixture').toString('base64'),
  );
});
test('a pending Keychain prompt times out and leaves the event loop responsive', async () => {
  const c = credentials.create(
    { isAsyncEncryptionAvailable: () => new Promise(() => {}) },
    { platform: 'darwin', timeoutMs: 40 },
  );
  let responsive = false;
  const heartBeat = setTimeout(() => {
    responsive = true;
  }, 1);
  await assert.rejects(c.available(), /Unlock macOS Keychain/);
  clearTimeout(heartBeat);
  assert.equal(responsive, true);
});
test('unavailable or invalid credentials never fall back to plaintext', async () => {
  const unavailable = credentials.create({ isAsyncEncryptionAvailable: async () => false });
  await assert.rejects(unavailable.encrypt('test-session'), /sign-in|Keychain/);
  const invalid = credentials.create({
    isAsyncEncryptionAvailable: async () => true,
    decryptStringAsync: async () => ({ result: undefined }),
  });
  await assert.rejects(invalid.decrypt('encoded-fixture'), /sign-in|Keychain/);
});
