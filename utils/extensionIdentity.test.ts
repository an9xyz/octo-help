import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CHROME_EXTENSION_ID,
  CHROME_EXTENSION_PUBLIC_KEY,
  FIREFOX_EXTENSION_ID,
} from './extensionIdentity';

/**
 * Reimplementation of Chromium's ID derivation (chrome/common/extensions:
 * `crx_file::id_util::GenerateId`): SHA-256 the DER public key, take the first
 * 16 bytes, and map each hex digit 0-f onto a-p.
 *
 * Kept in the test rather than in the module so the shipped code never imports
 * node:crypto — it would break the extension bundle, and nothing at runtime
 * needs to derive the ID.
 */
function deriveChromeExtensionId(publicKeyBase64: string): string {
  const der = Buffer.from(publicKeyBase64, 'base64');
  const hash = createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hash].map((hex) => String.fromCharCode(0x61 + Number.parseInt(hex, 16))).join('');
}

describe('extension identity', () => {
  it('derives the pinned Chrome ID from the pinned public key', () => {
    // The whole point of pinning: if either constant is edited independently,
    // installs silently move to a different ID (and a different storage area).
    expect(deriveChromeExtensionId(CHROME_EXTENSION_PUBLIC_KEY)).toBe(CHROME_EXTENSION_ID);
  });

  it('keeps the public key in the DER/SPKI shape manifest.key requires', () => {
    // Chromium rejects anything that is not a DER-encoded SubjectPublicKeyInfo,
    // and a PEM header / stray newline is the usual way this constant rots.
    expect(CHROME_EXTENSION_PUBLIC_KEY).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    const der = Buffer.from(CHROME_EXTENSION_PUBLIC_KEY, 'base64');
    expect(der.subarray(0, 2)).toEqual(Buffer.from([0x30, 0x82])); // SEQUENCE, long form
    expect(der.length).toBeGreaterThan(256); // RSA-2048 SPKI is 294 bytes
  });

  it('uses a well-formed Chrome ID and Firefox add-on ID', () => {
    expect(CHROME_EXTENSION_ID).toMatch(/^[a-p]{32}$/);
    expect(FIREFOX_EXTENSION_ID).toMatch(/^[^@\s]+@[^@\s]+$/);
  });
});
