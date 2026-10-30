// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Q = require('..');

function freshKey() {
  return Q.generateKey();
}

function registerAirframe(key) {
  return Q.register({ key, registration: 'G-QTVA', typeDesignator: 'B38M', msn: '65001', manufacturer: 'Quantova Aerospace', registrarLabel: 'Civil Aviation Registry' });
}

test('a registered airframe is a well formed signed record of the registrar', () => {
  const registrar = freshKey();
  const af = registerAirframe(registrar);
  assert.strictEqual(af.format, 'qairframe/1');
  assert.strictEqual(af.type, 'register');
  assert.strictEqual(af.algorithm, 'ML-DSA-65');
  assert.strictEqual(af.signer.id, Q.keyId(registrar));
  assert.strictEqual(af.statement.registrarKeyId, Q.keyId(registrar));
  assert.match(af.statement.airframeId, /^[0-9a-f]{32}$/);
  assert.strictEqual(Buffer.from(af.signer.publicKey, 'base64').length, Q.PUBLIC_KEY_BYTES);
  assert.strictEqual(Buffer.from(af.signature, 'base64').length, Q.SIGNATURE_BYTES);
});

test('the certify, maintenance and transfer records chain to the same airframe', () => {
  const registrar = freshKey();
  const authority = freshKey();
  const engineer = freshKey();
  const buyer = freshKey();
  const af = registerAirframe(registrar);
  const cert = Q.certify({ key: authority, register: af, certKind: 'standard' });
  const maint = Q.maintenance({ key: engineer, record: af, action: 'inspection', station: 'Line Station EGLL' });
  const moved = Q.transfer({ key: registrar, record: maint, to: Q.keyId(buyer), toLabel: 'Acme Leasing Ltd' });
  assert.strictEqual(cert.statement.airframeId, af.statement.airframeId);
  assert.strictEqual(cert.statement.registerRef, Q.recordRef(af));
  assert.strictEqual(maint.statement.priorRef, Q.recordRef(af));
  assert.strictEqual(moved.statement.airframeId, af.statement.airframeId);
  assert.strictEqual(moved.statement.fromKeyId, Q.keyId(registrar));
  assert.strictEqual(moved.statement.toKeyId, Q.keyId(buyer));
  assert.strictEqual(moved.statement.priorRef, Q.recordRef(maint));
});

test('invalid inputs are refused before anything is signed', () => {
  const key = freshKey();
  const base = { key, registration: 'G-QTVA', typeDesignator: 'B38M', msn: '65001', manufacturer: 'Quantova Aerospace' };
  assert.throws(() => Q.register(Object.assign({}, base, { registration: 'lowercase' })), /registration must be/);
  assert.throws(() => Q.register(Object.assign({}, base, { typeDesignator: 'TOOLONG' })), /typeDesignator must be/);
  assert.throws(() => Q.register(Object.assign({}, base, { manufacturer: '' })), /manufacturer cannot be empty/);
  assert.throws(() => Q.register(Object.assign({}, base, { unknownField: 1 })), /is not an option of register/);
  const af = registerAirframe(key);
  assert.throws(() => Q.certify({ key, register: af, certKind: 'super' }), /certKind must be one of/);
  assert.throws(() => Q.maintenance({ key, record: af, action: 'wash', station: 'S' }), /action must be one of/);
});

test('a transfer refuses a recipient equal to the sender', () => {
  const holder = freshKey();
  const af = registerAirframe(holder);
  assert.throws(() => Q.transfer({ key: holder, record: af, to: Q.keyId(holder) }), /the receiving key must differ/);
});

test('a signing key must be a well formed 32 byte seed', () => {
  assert.throws(() => registerAirframe(new Uint8Array(16)), /32 byte Uint8Array seed/);
  assert.throws(() => registerAirframe(new Uint8Array(32)), /too few different byte values/);
});

test('a well formed record verifies and a type mismatch is invalid', async () => {
  const registrar = freshKey();
  const af = registerAirframe(registrar);
  const ok = await Q.verify(af, { type: 'register', network: 'testnet', requireAnchor: false, strict: false });
  assert.strictEqual(ok.status, 'valid');
  assert.strictEqual(ok.type, 'register');
  assert.strictEqual(ok.airframeId, af.statement.airframeId);
  const wrongType = await Q.verify(af, { type: 'certify', network: 'testnet', requireAnchor: false, strict: false });
  assert.strictEqual(wrongType.status, 'invalid');
  const wrongSigner = await Q.verify(af, { type: 'register', network: 'testnet', requireAnchor: false, strict: false, signerKeyId: Q.keyId(freshKey()) });
  assert.strictEqual(wrongSigner.status, 'invalid');
});

test('a tampered statement no longer verifies', async () => {
  const registrar = freshKey();
  const af = registerAirframe(registrar);
  const forged = JSON.parse(JSON.stringify(af));
  forged.statement.typeDesignator = 'A320';
  const r = await Q.verify(forged, { type: 'register', network: 'testnet', requireAnchor: false, strict: false });
  assert.strictEqual(r.status, 'invalid');
  assert.ok(r.checks.some((c) => c.name === 'signature' && !c.ok));
});

test('the prior link binds a record to the record before it', async () => {
  const registrar = freshKey();
  const engineer = freshKey();
  const af = registerAirframe(registrar);
  const maint = Q.maintenance({ key: engineer, record: af, action: 'inspection', station: 'Line Station EGLL' });
  const good = await Q.verify(maint, { type: 'maintenance', network: 'testnet', requireAnchor: false, strict: false, prior: af });
  assert.ok(good.checks.some((c) => c.name === 'prior' && c.ok));
  const otherAf = registerAirframe(registrar);
  const bad = await Q.verify(maint, { type: 'maintenance', network: 'testnet', requireAnchor: false, strict: false, prior: otherAf });
  assert.strictEqual(bad.status, 'invalid');
  assert.ok(bad.checks.some((c) => c.name === 'prior' && !c.ok));
});

test('airframeRef is deterministic for the same secret and reference and differs otherwise', () => {
  const secret = new Uint8Array(32);
  globalThis.crypto.getRandomValues(secret);
  const a = Q.airframeRef(secret, 'G-QTVA 65001');
  const b = Q.airframeRef(secret, 'G-QTVA 65001');
  const c = Q.airframeRef(secret, 'G-QTVB 65002');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('the kind and constants are the ones pinned for the airworthiness line', () => {
  assert.strictEqual(Q.KIND, 1404);
  assert.strictEqual(Q.FORMAT, 'qairframe/1');
  assert.deepStrictEqual([...Q.TYPES], ['register', 'certify', 'maintenance', 'transfer', 'retire']);
  assert.deepStrictEqual([...Q.CERTS], ['standard', 'restricted', 'experimental', 'special']);
  assert.deepStrictEqual([...Q.ACTIONS], ['inspection', 'repair', 'modification', 'overhaul', 'directive']);
});
