# QAirframe

QAirframe is a live production post quantum airworthiness and maintenance record tool for aircraft on the Quantova network. It proves the registration, certificate of airworthiness, maintenance return to service, transfer and retirement of an airframe, and it lets any third party confirm that history without trusting the party that created it.

QAirframe proves records without disclosing them. Aircraft identities and owner details stay private on the systems of the party that holds them. Only a salted cryptographic commitment is written to the chain, and no commercial detail is ever published.

## What it records

Each record is a signed envelope of one of five types.

1. register, a registrar states the registration, type designator, manufacturer serial number and manufacturer of an airframe.
2. certify, an authority issues a certificate of airworthiness of a stated kind.
3. maintenance, an approved engineer records a maintenance action and return to service at a named station.
4. transfer, the owner of an airframe moves it to another party.
5. retire, the holder withdraws an airframe from service and states why.

Every record is signed with ML-DSA-65 under FIPS 204 by the party whose role it names, and each later record links to the one before it so the whole life of an airframe forms a chain.

## Proving the time

A record on its own carries only the claim of its signer. Anchoring a record on the Quantova network through Qstamp adds a post quantum evidence anchor that fixes the latest moment the record existed, provable against the record and the signer by anyone, without claiming a regulated timestamp status that Quantova Inc does not hold.

## Install

```
npm install @quantovainc/qairframe
```

## Use

```js
const qairframe = require('@quantovainc/qairframe');

const registrar = qairframe.generateKey();
const airframe = qairframe.register({
  key: registrar,
  registration: 'G-QTVA',
  typeDesignator: 'B38M',
  msn: '65001',
  manufacturer: 'Quantova Aerospace',
  registrarLabel: 'Civil Aviation Registry',
});

const anchored = await qairframe.anchor(airframe, { seed, index: 0, network: 'testnet' });
const result = await qairframe.verify(anchored[0], { type: 'register', network: 'testnet' });
```

## What a record does not establish

1. It does not show that the stated facts are true. It shows only that the signer stated them and that the statement existed unchanged at a point in time.
2. It does not identify a natural or legal person. The signer is a chain address, and linking an address to a registrar, authority or engineer is a separate attestation.
3. The labels are text written by the signer, they are not a verified identity.

## License

Apache-2.0 OR MIT
