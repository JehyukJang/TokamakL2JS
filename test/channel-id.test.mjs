import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_CHANNEL_ID,
  TokamakL2StateManager,
  createStateManagerOptsFromChannelConfig,
  createTokamakL2Common,
  formatChannelId,
  parseChannelId,
} from '../dist/index.js'

const MAINNET_CHANNEL_ID = '108336797649051254585401751173864353497144788660297920004548699607442466523065'

const makeChannelConfig = (channelId) => ({
  channelId,
  network: 'mainnet',
  participants: [],
  storageConfigs: [],
  callCodeAddresses: [],
  blockNumber: 0,
})

test('channel IDs round-trip losslessly through config, RPC initialization, and snapshots', async () => {
  const boundaryValues = [
    '0',
    String(Number.MAX_SAFE_INTEGER - 1),
    String(Number.MAX_SAFE_INTEGER),
    String(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    MAINNET_CHANNEL_ID,
    MAX_CHANNEL_ID.toString(),
  ]

  for (const channelId of boundaryValues) {
    const opts = createStateManagerOptsFromChannelConfig(makeChannelConfig(channelId))
    assert.equal(opts.channelId, BigInt(channelId))

    const rpcStateManager = new TokamakL2StateManager({ common: createTokamakL2Common() })
    await rpcStateManager.initTokamakExtendsFromRPC('http://127.0.0.1:1', opts)
    const rpcSnapshot = await rpcStateManager.captureStateSnapshot()
    assert.equal(rpcSnapshot.channelId, channelId)

    const serializedSnapshot = JSON.parse(JSON.stringify(rpcSnapshot))
    assert.equal(serializedSnapshot.channelId, channelId)

    const snapshotStateManager = new TokamakL2StateManager({ common: createTokamakL2Common() })
    await snapshotStateManager.initTokamakExtendsFromSnapshot(serializedSnapshot, {
      contractCodes: [],
    })
    assert.equal((await snapshotStateManager.captureStateSnapshot()).channelId, channelId)
  }
})

test('channel ID parsing rejects non-canonical or out-of-range JSON values', () => {
  const invalidValues = [
    '',
    '00',
    '01',
    '+1',
    '-1',
    ' 1',
    '1 ',
    '1.0',
    '0x1',
    (MAX_CHANNEL_ID + 1n).toString(),
    1,
  ]

  for (const value of invalidValues) {
    assert.throws(() => parseChannelId(value), /Channel ID/)
  }
})

test('channel ID formatting accepts only uint256 bigint values', () => {
  assert.equal(formatChannelId(0n), '0')
  assert.equal(formatChannelId(MAX_CHANNEL_ID), MAX_CHANNEL_ID.toString())
  assert.throws(() => formatChannelId(-1n), /Channel ID/)
  assert.throws(() => formatChannelId(MAX_CHANNEL_ID + 1n), /Channel ID/)
  assert.throws(() => formatChannelId(1), /Channel ID/)
})
