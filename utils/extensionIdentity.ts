/**
 * Pinned extension identity.
 *
 * Why this exists: an unpacked Chromium extension has no inherent identity — the
 * browser derives its ID by hashing the *absolute path* of the directory it was
 * loaded from. Since this extension ships as a ZIP that users extract wherever
 * they like ("加载已解压的扩展程序"), every machine, and every re-extract into a
 * new folder, produced a different ID. Consequences, all of them silent:
 *
 * - `chrome-extension://<id>/…` URLs change, so nothing (bug report, allowlist,
 *   screenshot, external link) can refer to the extension stably.
 * - Reinstalling into a fresh folder registers a *new* extension rather than the
 *   same one, which starts from empty `browser.storage.local` — the user loses
 *   their imported pets and every toggle without being told why.
 * - `web_accessible_resources` are served from that origin, so anything that
 *   pinned the old origin (e.g. a CSP allowlist on the page side) breaks.
 *
 * Declaring `manifest.key` overrides the path-derived ID: Chromium hashes the
 * public key instead, so the ID is the same everywhere, forever. Only the
 * *public* key is needed for that, which is why committing it here is safe.
 *
 * Firefox does not read `key`; its stable ID comes from
 * `browser_specific_settings.gecko.id`, kept next to it below so the two never
 * drift apart.
 */

/**
 * Base64 (no line breaks) DER/SPKI RSA-2048 public key, i.e. the exact format
 * Chromium's `manifest.key` expects — `openssl rsa -pubout -outform DER`.
 *
 * The matching private key is *not* in this repo and is not needed for the
 * pinned ID; it is only required to sign a `.crx` for self-hosted updates. See
 * README「固定的扩展 ID」for how it was generated and how to rotate it.
 *
 * Do not reformat: any byte change here silently changes CHROME_EXTENSION_ID,
 * which is exactly the failure mode this file exists to prevent.
 * `extensionIdentity.test.ts` recomputes the ID from this key and fails if the
 * two disagree.
 */
export const CHROME_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2Uu2SYR0Y9QYZl/uewcuaT28MaRZtI4pKNbKjSrHuFvhTprhcegJEOwp+/zFP5JvXLNldhUKqwvKuk2N+Svg3E+4YlR6kVfK9GQpGlt5i5IIEMP7pz02UZVRyBfS2qbrcb3KhYh/0zyBg59uWEhGhGexH65fuRBFqt2HxO7UwvIg6Iqac1XrWu7eL5wb0+Nh9LIH2A5BWetJUdVxhBUZ7MoQRWpIE2hue+5cpV4/o2dH4PCDvVIUwcFVEicmbw2dxVd66Etrq7DngLk/6gO149aMtNSh1nidifZ8zkEuVKBPvf15/7wWj+A1jelimHalrJslroMv7l09nb+s5DXszQIDAQAB';

/**
 * The ID Chromium derives from CHROME_EXTENSION_PUBLIC_KEY: first 128 bits of
 * its SHA-256, each hex digit mapped 0-f → a-p. Written out literally so the
 * value is greppable and reviewable in a diff instead of being recomputed at
 * build time.
 */
export const CHROME_EXTENSION_ID = 'pcofpmfiknglflncnjejfldadchndnoo';

/** Stable Firefox add-on ID. Any change here creates a *new* add-on. */
export const FIREFOX_EXTENSION_ID = 'octo-chat-enhancer@botshen.github.io';
