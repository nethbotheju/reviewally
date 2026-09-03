// PEM/DER helpers. GitHub App keys ship as PKCS#8 ("BEGIN PRIVATE KEY") or
// PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto only imports PKCS#8.

export const RSA_OID = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];

// Parses a PEM body to DER bytes. Throws actionable errors for bad pastes.
export function pemToDer(pem) {
  const b64 = String(pem)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/[\s\r\n]+/g, '');
  if (!b64) throw new Error('no PEM body found — was the full file pasted?');
  let raw;
  try {
    raw = atob(b64);
  } catch {
    throw new Error('key body is not valid base64 — stray characters in the paste');
  }
  if (raw.length < 100) {
    throw new Error(`key body too short (${raw.length} chars) — paste is truncated`);
  }
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Reads a DER length field at `offset` (the byte after the tag).
// Returns [length, headerLength].
function readDerLength(der, offset) {
  const first = der[offset];
  if (first === undefined) throw new Error('truncated DER: missing length field');
  if (first < 0x80) return [first, 1];
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 4) {
    throw new Error('unsupported DER length form (indefinite or > 4 bytes)');
  }
  if (offset + numBytes >= der.length) {
    throw new Error('truncated DER: length field overruns the buffer');
  }
  let len = 0;
  for (let i = 1; i <= numBytes; i++) len = (len << 8) | der[offset + i];
  return [len, 1 + numBytes];
}

// True when the DER is a PKCS#8 PrivateKeyInfo whose algorithm is rsaEncryption.
export function looksLikePkcs8(der) {
  try {
    if (der[0] !== 0x30) return false; // outer SEQUENCE
    const [, outerHeader] = readDerLength(der, 1);

    const i = 1 + outerHeader; // first inner element
    if (der[i] !== 0x02 || der[i + 1] !== 0x01 || der[i + 2] !== 0x00) return false; // INTEGER version 0

    const algSeq = i + 3;
    if (der[algSeq] !== 0x30) return false; // AlgorithmIdentifier SEQUENCE
    const [, algSeqHeader] = readDerLength(der, algSeq + 1);

    const oid = algSeq + 1 + algSeqHeader;
    if (der[oid] !== 0x06) return false; // OID tag
    const [oidLen, oidHeader] = readDerLength(der, oid + 1);
    if (oidLen !== RSA_OID.length) return false;
    for (let k = 0; k < RSA_OID.length; k++) {
      if (der[oid + 1 + oidHeader + k] !== RSA_OID[k]) return false;
    }

    // rsaEncryption must be followed by NULL params, then the OCTET STRING key.
    const params = oid + 1 + oidHeader + oidLen;
    if (der[params] !== 0x05 || der[params + 1] !== 0x00) return false;
    if (der[params + 2] !== 0x04) return false; // OCTET STRING wrapping RSAPrivateKey
    return true;
  } catch {
    return false;
  }
}

function derLen(n) {
  if (n < 0x80) return [n];
  const bytes = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag, content) {
  return [tag, ...derLen(content.length), ...content];
}

// Passes PKCS#8 DER through unchanged; wraps a PKCS#1 RSAPrivateKey into PKCS#8.
export function toPkcs8(der) {
  if (looksLikePkcs8(der)) return der;
  const inner = [
    0x02, 0x01, 0x00, // version 0
    0x30, 0x0d, 0x06, 0x09, ...RSA_OID, 0x05, 0x00, // AlgorithmIdentifier
    ...tlv(0x04, [...der]),
  ];
  return new Uint8Array(tlv(0x30, inner));
}
