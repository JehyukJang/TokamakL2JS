import assert from 'node:assert/strict'
import test from 'node:test'

import { jubjub } from '@noble/curves/misc.js'
import { Address, bytesToHex } from '@ethereumjs/util'

import {
  createTokamakL2Common,
  createTokamakL2Tx,
  createTokamakL2TxFromRLP,
} from '../dist/index.js'

const PRIVATE_KEY = 7n
const CHANNEL_TRANSACTION_INDEX = 7n
const EXPECTED_R = 0x495a94d5cb3cfe94466372aeb28b573041707dbbd7b6def2a46cae05428d2745n
const EXPECTED_S = 0x0772c243f0cfe2a82f09a53176f72e59e0e18afbcfde3cc637ce6964c5a61365n
const EXPECTED_SERIALIZED = '0xf87f0794000000000000000000000000000000000000123484a9059cbba0f069d0537a8f7e4ca477c8d9a0212ee66d738f5a402177d0c57c9c41783c49bc1ba0495a94d5cb3cfe94466372aeb28b573041707dbbd7b6def2a46cae05428d2745a00772c243f0cfe2a82f09a53176f72e59e0e18afbcfde3cc637ce6964c5a61365'

const toBytesBE = (value, length = 32) => {
  const result = new Uint8Array(length)
  for (let index = length - 1; index >= 0; index--) {
    result[index] = Number(value & 0xffn)
    value >>= 8n
  }
  if (value !== 0n) throw new Error(`Value does not fit in ${length} bytes`)
  return result
}

const createSignedFixture = () => {
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY).toBytes()
  return createTokamakL2Tx({
    channelTransactionIndex: CHANNEL_TRANSACTION_INDEX,
    to: new Address(toBytesBE(0x1234n, 20)),
    data: Uint8Array.from([0xa9, 0x05, 0x9c, 0xbb]),
    senderPubKey: publicKey,
  }, { common: createTokamakL2Common() }).sign(toBytesBE(PRIVATE_KEY))
}

test('channelTransactionIndex preserves the previous signature and RLP wire vector', () => {
  const signed = createSignedFixture()
  const message = signed.getMessageToSign()

  assert.equal(signed.channelTransactionIndex, CHANNEL_TRANSACTION_INDEX)
  assert.equal(message.length, 32)
  assert.equal(
    bytesToHex(message[0]),
    '0x0000000000000000000000000000000000000000000000000000000000000007',
  )
  assert.equal(signed.r, EXPECTED_R)
  assert.equal(signed.s, EXPECTED_S)
  assert.equal(bytesToHex(signed.serialize()), EXPECTED_SERIALIZED)
})

test('transaction snapshots and RLP reconstruction expose only channelTransactionIndex', () => {
  const signed = createSignedFixture()
  const snapshot = signed.captureTxSnapshot()
  const reconstructed = createTokamakL2TxFromRLP(signed.serialize(), {
    common: createTokamakL2Common(),
  })

  assert.equal(snapshot.channelTransactionIndex, Number(CHANNEL_TRANSACTION_INDEX))
  assert.equal('nonce' in snapshot, false)
  assert.equal(reconstructed.channelTransactionIndex, CHANNEL_TRANSACTION_INDEX)
  assert.equal(bytesToHex(reconstructed.serialize()), EXPECTED_SERIALIZED)
})

test('legacy nonce input is rejected instead of treated as a compatibility alias', () => {
  const publicKey = jubjub.Point.BASE.multiply(PRIVATE_KEY).toBytes()

  assert.throws(
    () => createTokamakL2Tx({
      nonce: CHANNEL_TRANSACTION_INDEX,
      to: new Address(toBytesBE(0x1234n, 20)),
      data: Uint8Array.from([0xa9, 0x05, 0x9c, 0xbb]),
      senderPubKey: publicKey,
    }, { common: createTokamakL2Common() }),
    /'nonce' is no longer accepted/,
  )
})
