import assert from 'node:assert/strict'
import test from 'node:test'

import { jubjub } from '@noble/curves/misc.js'
import { Address } from '@ethereumjs/util'

import {
  FUNCTION_INPUT_LENGTH,
  createTokamakL2Common,
  createTokamakL2Tx,
  eddsaSign,
  eddsaVerify,
  getEddsaPublicKey,
  poseidon,
} from '../dist/index.js'

const FIELD_PRIME = jubjub.Point.Fp.ORDER
const SCALAR_ORDER = jubjub.Point.Fn.ORDER
const PRIVATE_KEY = 7n
const RANDOMIZER_SCALAR = 11n

const concatBytes = (...arrays) => {
  const result = new Uint8Array(arrays.reduce((length, array) => length + array.length, 0))
  let offset = 0
  for (const array of arrays) {
    result.set(array, offset)
    offset += array.length
  }
  return result
}

const toBytesBE = (value, length = 32) => {
  const result = new Uint8Array(length)
  for (let index = length - 1; index >= 0; index--) {
    result[index] = Number(value & 0xffn)
    value >>= 8n
  }
  if (value !== 0n) throw new Error(`Value does not fit in ${length} bytes`)
  return result
}

const toBytesLE = (value, length = 32) => {
  const result = new Uint8Array(length)
  for (let index = 0; index < length; index++) {
    result[index] = Number(value & 0xffn)
    value >>= 8n
  }
  if (value !== 0n) throw new Error(`Value does not fit in ${length} bytes`)
  return result
}

const toBigIntBE = (bytes) => {
  let result = 0n
  for (const byte of bytes) result = (result << 8n) | BigInt(byte)
  return result
}

const makeMessageWords = () => {
  const words = Array.from(
    { length: FUNCTION_INPUT_LENGTH + 3 },
    (_, index) => BigInt(index + 1) * 0x10000000000000001n,
  )
  words[1] = 0x111122223333444455556666777788889999aaaAn
  words[2] = 0xa9059cbbn
  return words
}

const getChallenge = (publicKey, randomizer, messages) => {
  const publicKeyAffine = publicKey.toAffine()
  const randomizerAffine = randomizer.toAffine()
  return toBigIntBE(poseidon(concatBytes(
    toBytesBE(randomizerAffine.x),
    toBytesBE(randomizerAffine.y),
    toBytesBE(publicKeyAffine.x),
    toBytesBE(publicKeyAffine.y),
    ...messages,
  ))) % SCALAR_ORDER
}

const signatureFor = (publicKey, randomizer, messages, randomizerScalar = RANDOMIZER_SCALAR) => (
  randomizerScalar + getChallenge(publicKey, randomizer, messages) * PRIVATE_KEY
) % SCALAR_ORDER

const explicitCofactorEquation = (publicKey, randomizer, challenge, signature) => {
  const lhs = jubjub.Point.BASE.multiplyUnsafe((8n * signature) % SCALAR_ORDER)
  const rhs = randomizer
    .clearCofactor()
    .add(publicKey.clearCofactor().multiplyUnsafe(challenge))
  return lhs.equals(rhs)
}

test('eddsaVerify matches the deterministic zk-EVM acceptance corpus', () => {
  const messages = makeMessageWords().map((word) => toBytesBE(word))
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY)
  const randomizer = jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR)
  const signature = signatureFor(publicKey, randomizer, messages)
  const orderTwo = jubjub.Point.fromAffine({ x: 0n, y: FIELD_PRIME - 1n })
  const mixedOrderPublicKey = publicKey.add(orderTwo)
  const changedMessages = messages.map((message) => message.slice())
  changedMessages[3][31] ^= 1

  const corpus = [
    {
      id: 'valid-supported-signer',
      expected: true,
      publicKey,
      ...(() => {
        const signed = eddsaSign(PRIVATE_KEY, messages)
        return { randomizer: signed.R, signature: signed.S }
      })(),
      messages,
    },
    { id: 'valid-deterministic-subgroup', expected: true, publicKey, randomizer, signature, messages },
    {
      id: 'valid-mixed-order-public-key',
      expected: true,
      publicKey: mixedOrderPublicKey,
      randomizer,
      signature: signatureFor(mixedOrderPublicKey, randomizer, messages),
      messages,
    },
    {
      id: 'valid-nonidentity-small-order-randomizer',
      expected: true,
      publicKey,
      randomizer: orderTwo,
      signature: signatureFor(publicKey, orderTwo, messages, 0n),
      messages,
    },
    {
      id: 'reject-invalid-public-key-point',
      expected: false,
      publicKey: jubjub.Point.fromAffine({ x: 1n, y: 1n }),
      randomizer,
      signature,
      messages,
    },
    {
      id: 'reject-invalid-randomizer-point',
      expected: false,
      publicKey,
      randomizer: jubjub.Point.fromAffine({ x: 1n, y: 1n }),
      signature,
      messages,
    },
    { id: 'reject-identity-public-key', expected: false, publicKey: jubjub.Point.ZERO, randomizer, signature, messages },
    { id: 'reject-pure-torsion-public-key', expected: false, publicKey: orderTwo, randomizer, signature, messages },
    { id: 'reject-identity-randomizer', expected: false, publicKey, randomizer: jubjub.Point.ZERO, signature, messages },
    { id: 'reject-mutated-message', expected: false, publicKey, randomizer, signature, messages: changedMessages },
    {
      id: 'reject-mutated-public-key',
      expected: false,
      publicKey: jubjub.Point.BASE.multiply(PRIVATE_KEY + 1n),
      randomizer,
      signature,
      messages,
    },
    {
      id: 'reject-mutated-randomizer',
      expected: false,
      publicKey,
      randomizer: jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR + 1n),
      signature,
      messages,
    },
    { id: 'reject-mutated-signature', expected: false, publicKey, randomizer, signature: (signature + 1n) % SCALAR_ORDER, messages },
    { id: 'reject-zero-signature', expected: false, publicKey, randomizer, signature: 0n, messages },
    { id: 'reject-n-minus-one-signature', expected: false, publicKey, randomizer, signature: SCALAR_ORDER - 1n, messages },
    { id: 'reject-s-plus-n', expected: false, publicKey, randomizer, signature: signature + SCALAR_ORDER, messages },
  ]

  for (const vector of corpus) {
    assert.equal(
      eddsaVerify(vector.messages, vector.publicKey, vector.randomizer, vector.signature),
      vector.expected,
      vector.id,
    )
  }
})

test('eddsaVerify returns booleans for the full response-scalar boundary', () => {
  const messages = [toBytesBE(0x1234n)]
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY)
  const signed = eddsaSign(PRIVATE_KEY, messages)

  for (const scalar of [0n, SCALAR_ORDER - 1n, SCALAR_ORDER, -1n]) {
    assert.doesNotThrow(() => {
      assert.equal(typeof eddsaVerify(messages, publicKey, signed.R, scalar), 'boolean')
    }, `S=${scalar}`)
  }
  assert.equal(eddsaVerify(messages, publicKey, signed.R, SCALAR_ORDER), false)
  assert.equal(eddsaVerify(messages, publicKey, signed.R, -1n), false)
})

test('zero challenge multiplication and residual clearing match the explicit equation', () => {
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY)
  const randomizer = jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR)
  const challenge = 0n
  const signature = RANDOMIZER_SCALAR

  assert.doesNotThrow(() => publicKey.multiplyUnsafe(challenge))
  const residual = randomizer
    .add(publicKey.multiplyUnsafe(challenge))
    .subtract(jubjub.Point.BASE.multiplyUnsafe(signature))
  assert.equal(residual.clearCofactor().equals(jubjub.Point.ZERO), true)
  assert.equal(explicitCofactorEquation(publicKey, randomizer, challenge, signature), true)
  assert.equal(
    residual.clearCofactor().add(jubjub.Point.BASE).equals(jubjub.Point.ZERO),
    false,
    'a mutated terminal equation must fail',
  )
})

test('residual cofactor clearing is equivalent to the explicit zk-EVM equation', () => {
  const messages = makeMessageWords().map((word) => toBytesBE(word))
  const subgroupPublicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY)
  const orderTwo = jubjub.Point.fromAffine({ x: 0n, y: FIELD_PRIME - 1n })
  const vectors = [
    {
      publicKey: subgroupPublicKey,
      randomizer: jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR),
      randomizerScalar: RANDOMIZER_SCALAR,
    },
    {
      publicKey: subgroupPublicKey.add(orderTwo),
      randomizer: jubjub.Point.BASE.multiply(RANDOMIZER_SCALAR),
      randomizerScalar: RANDOMIZER_SCALAR,
    },
    { publicKey: subgroupPublicKey, randomizer: orderTwo, randomizerScalar: 0n },
  ]

  for (const vector of vectors) {
    const challenge = getChallenge(vector.publicKey, vector.randomizer, messages)
    const signature = signatureFor(
      vector.publicKey,
      vector.randomizer,
      messages,
      vector.randomizerScalar,
    )
    const residual = vector.randomizer
      .add(vector.publicKey.multiplyUnsafe(challenge))
      .subtract(jubjub.Point.BASE.multiplyUnsafe(signature))
    assert.equal(
      residual.clearCofactor().equals(jubjub.Point.ZERO),
      explicitCofactorEquation(vector.publicKey, vector.randomizer, challenge, signature),
    )
    assert.equal(eddsaVerify(messages, vector.publicKey, vector.randomizer, signature), true)
  }
})

test('getEddsaPublicKey enforces canonical compressed-point decoding', () => {
  const message = toBytesBE(0x1234n)
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY)
  const signed = eddsaSign(PRIVATE_KEY, [message])
  const validMessageHash = concatBytes(message, publicKey.toBytes())

  assert.deepEqual(
    getEddsaPublicKey(validMessageHash, 27n, signed.R.toBytes(), toBytesBE(signed.S)),
    publicKey.toBytes(),
  )

  const nonCanonicalPublicKey = toBytesLE(FIELD_PRIME)
  assert.throws(
    () => getEddsaPublicKey(
      concatBytes(message, nonCanonicalPublicKey),
      27n,
      signed.R.toBytes(),
      toBytesBE(signed.S),
    ),
    /point\.y/,
  )

  const invalidRandomizer = toBytesLE(2n)
  assert.throws(
    () => getEddsaPublicKey(
      validMessageHash,
      27n,
      invalidRandomizer,
      toBytesBE(signed.S),
    ),
    /invalid y coordinate/,
  )

  const negativeZeroPublicKey = toBytesLE(1n)
  negativeZeroPublicKey[31] |= 0x80
  assert.throws(
    () => getEddsaPublicKey(
      concatBytes(message, negativeZeroPublicKey),
      27n,
      signed.R.toBytes(),
      toBytesBE(signed.S),
    ),
    /x=0 and x_0=1/,
  )
})

test('TokamakL2Tx verification uses the cofactor-8 verifier', () => {
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY)
  const data = new Uint8Array(4 + FUNCTION_INPUT_LENGTH * 32)
  data.set([0xa9, 0x05, 0x9c, 0xbb])
  const unsigned = createTokamakL2Tx({
    nonce: 1n,
    to: new Address(toBytesBE(0x1234n, 20)),
    data,
    senderPubKey: publicKey.toBytes(),
  }, { common: createTokamakL2Common() })
  const signed = unsigned.sign(toBytesBE(PRIVATE_KEY))

  assert.equal(signed.verifySignature(), true)
  assert.equal(signed.addSignature(27n, signed.r, (signed.s + 1n) % SCALAR_ORDER).verifySignature(), false)
})
