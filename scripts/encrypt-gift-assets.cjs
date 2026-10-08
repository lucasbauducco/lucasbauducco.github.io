'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');

const MAGIC = Buffer.from('AGFT1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function encryptPayload(payload, key, iv = randomBytes(IV_BYTES)) {
  if (!Buffer.isBuffer(payload)) throw new TypeError('payload must be a Buffer');
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new TypeError('key must contain 32 bytes');
  if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) throw new TypeError('iv must contain 12 bytes');

  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([MAGIC, iv, ciphertext, cipher.getAuthTag()]);
}

function decryptPayload(encrypted, key) {
  if (!Buffer.isBuffer(encrypted)) throw new TypeError('encrypted payload must be a Buffer');
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new TypeError('key must contain 32 bytes');
  if (encrypted.length < MAGIC.length + IV_BYTES + TAG_BYTES) throw new Error('encrypted payload is incomplete');
  if (!encrypted.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('encrypted payload has an invalid header');

  const ivStart = MAGIC.length;
  const dataStart = ivStart + IV_BYTES;
  const tagStart = encrypted.length - TAG_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(ivStart, dataStart), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(encrypted.subarray(tagStart));
  return Buffer.concat([decipher.update(encrypted.subarray(dataStart, tagStart)), decipher.final()]);
}

function parseArgs(argv) {
  const options = { photos: [], force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--force') {
      options.force = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    index += 1;
    if (argument === '--photo') options.photos.push(value);
    else if (argument === '--content') options.content = value;
    else if (argument === '--output') options.output = value;
    else if (argument === '--secret-file') options.secretFile = value;
    else if (argument === '--site-url') options.siteUrl = value;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function assertInputs(options) {
  for (const name of ['content', 'output', 'secretFile', 'siteUrl']) {
    if (!options[name]) throw new Error(`Missing required --${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`);
  }
  if (options.photos.length !== 4) throw new Error('Exactly four --photo paths are required');
  const inputs = [options.content, ...options.photos];
  for (const input of inputs) {
    if (!fs.statSync(input).isFile()) throw new Error(`Input is not a file: ${input}`);
  }

  const content = JSON.parse(fs.readFileSync(options.content, 'utf8'));
  if (!Array.isArray(content.photos) || content.photos.length !== 4) throw new Error('Content must describe exactly four photos');
  const expected = content.photos.map(photo => photo.file);
  if (expected.some((filename, index) => filename !== `photo-0${index + 1}.enc`)) {
    throw new Error('Photo filenames must be photo-01.enc through photo-04.enc');
  }
  return content;
}

function writeAtomically(target, data) {
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temporary, data, { flag: 'wx' });
  fs.renameSync(temporary, target);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertInputs(options);

  const targets = [
    path.join(options.output, 'content.enc'),
    ...options.photos.map((_, index) => path.join(options.output, `photo-0${index + 1}.enc`)),
    options.secretFile
  ];
  if (!options.force) {
    const existing = targets.find(target => fs.existsSync(target));
    if (existing) throw new Error(`Refusing to overwrite existing output: ${existing}`);
  }

  const key = randomBytes(KEY_BYTES);
  const payloads = [
    encryptPayload(fs.readFileSync(options.content), key),
    ...options.photos.map(photo => encryptPayload(fs.readFileSync(photo), key))
  ];

  fs.mkdirSync(options.output, { recursive: true });
  fs.mkdirSync(path.dirname(options.secretFile), { recursive: true });
  for (let index = 0; index < payloads.length; index += 1) {
    if (options.force && fs.existsSync(targets[index])) fs.unlinkSync(targets[index]);
    writeAtomically(targets[index], payloads[index]);
  }

  const fragment = `#para-antonela-${key.toString('base64url')}`;
  const siteUrl = options.siteUrl.replace(/#.*$/, '');
  const secretDocument = [
    'Enlace privado para Antonela. No publicar ni versionar.',
    `${siteUrl}${fragment}`,
    '',
    'El fragmento contiene la clave de descifrado. Cualquiera con el enlace completo puede abrir la carta.',
    ''
  ].join('\n');
  if (options.force && fs.existsSync(options.secretFile)) fs.unlinkSync(options.secretFile);
  writeAtomically(options.secretFile, secretDocument);
  try { fs.chmodSync(options.secretFile, 0o600); } catch (_) { /* Windows may ignore POSIX modes. */ }

  process.stdout.write(`Encrypted ${payloads.length} payloads. Secret link saved outside Git.\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { encryptPayload, decryptPayload };
