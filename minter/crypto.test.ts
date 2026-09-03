import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { pemToDer, looksLikePkcs8, toPkcs8 } from './crypto.js';

const nodeCrypto = webcrypto as unknown as typeof crypto;

let pkcs1Pem: string;
let pkcs8Pem: string;
let publicKey: CryptoKey;

function derToPem(der: Uint8Array, label: string): string {
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

beforeAll(async () => {
  const { privateKey, publicKey: pub } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  pkcs1Pem = derToPem(
    privateKey.export({ format: 'der', type: 'pkcs1' }) as unknown as Uint8Array,
    'RSA PRIVATE KEY',
  );
  pkcs8Pem = derToPem(
    privateKey.export({ format: 'der', type: 'pkcs8' }) as unknown as Uint8Array,
    'PRIVATE KEY',
  );
  publicKey = await nodeCrypto.subtle.importKey(
    'spki',
    pub.export({ format: 'der', type: 'spki' }) as unknown as Uint8Array,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
});

describe('pemToDer', () => {
  it('parses a PKCS#1 PEM', () => {
    const der = pemToDer(pkcs1Pem);
    expect(der.length).toBeGreaterThan(100);
    expect(der[0]).toBe(0x30);
  });

  it('parses a PKCS#8 PEM', () => {
    const der = pemToDer(pkcs8Pem);
    expect(der.length).toBeGreaterThan(100);
    expect(der[0]).toBe(0x30);
  });

  it('rejects an empty body', () => {
    expect(() => pemToDer('-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----')).toThrow(
      'no PEM body found',
    );
  });

  it('rejects invalid base64', () => {
    expect(() => pemToDer('-----BEGIN RSA PRIVATE KEY-----\n!!!not-base64!!!\n-----END RSA PRIVATE KEY-----')).toThrow(
      'not valid base64',
    );
  });

  it('rejects a truncated paste', () => {
    const short = Buffer.from('a'.repeat(80)).toString('base64');
    expect(() =>
      pemToDer(`-----BEGIN RSA PRIVATE KEY-----\n${short}\n-----END RSA PRIVATE KEY-----`),
    ).toThrow('too short');
  });
});

describe('looksLikePkcs8', () => {
  it('recognizes a real PKCS#8 key', () => {
    expect(looksLikePkcs8(pemToDer(pkcs8Pem))).toBe(true);
  });

  it('does not misclassify a PKCS#1 key', () => {
    expect(looksLikePkcs8(pemToDer(pkcs1Pem))).toBe(false);
  });

  it('returns false for garbage bytes instead of throwing', () => {
    expect(looksLikePkcs8(new Uint8Array(1200).fill(0x30))).toBe(false);
  });
});

describe('toPkcs8', () => {
  it('passes PKCS#8 DER through unchanged', () => {
    const der = pemToDer(pkcs8Pem);
    expect(toPkcs8(der)).toBe(der);
  });

  it('wraps a PKCS#1 key into an importable, signable PKCS#8 structure', async () => {
    const wrapped = toPkcs8(pemToDer(pkcs1Pem));
    expect(looksLikePkcs8(wrapped)).toBe(true);

    const key = await nodeCrypto.subtle.importKey(
      'pkcs8',
      wrapped,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const data = new TextEncoder().encode('reviewally round-trip');
    const sig = await nodeCrypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data);
    expect(await nodeCrypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, data)).toBe(true);
  });

  it('wrapped length uses long-form DER correctly (2048-bit keys exceed 255 bytes)', () => {
    const der = pemToDer(pkcs1Pem);
    const wrapped = toPkcs8(der);
    // Outer SEQUENCE length must be encoded in the minimal number of bytes and
    // the total must account for every content byte (no off-by-one at boundaries).
    expect(wrapped[1]).toBe(0x82); // long form, 2 length bytes
    const declared = (wrapped[2] << 8) | wrapped[3];
    expect(wrapped.length).toBe(4 + declared);
  });
});
