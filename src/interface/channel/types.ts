/** A canonical unsigned decimal string containing a uint256 channel ID. */
export type ChannelIdJson = string;

export type StateSnapshot = {
  stateRoots: string[];
  storageAddresses: string[];
  storageKeys: StorageKeysJson;
  storageTrieRoots: string[];
  storageTrieDb: StorageTrieDbJson;
  channelId: ChannelIdJson;
}

export type StorageKeysJson = string[][]

export type StorageTrieDbEntryJson = {
  key: string;
  value: string;
}

export type StorageTrieDbJson = StorageTrieDbEntryJson[][]

export type StorageEntryJson = {
  key: string;
  value: string;
}

export type StorageEntriesJson = StorageEntryJson[][]

export type TxSnapshot = {
  channelTransactionIndex: number;
  to: string;
  data: string;
  senderPubKey: string;
  v?: string;
  r?: string;
  s?: string;
}
