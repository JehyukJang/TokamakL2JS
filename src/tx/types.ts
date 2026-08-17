import { LegacyTxData } from "@ethereumjs/tx";
import { Address } from "@ethereumjs/util"

export type TokamakL2TxData = Omit<LegacyTxData, 'nonce'> & {
  /**
   * The index assigned by the channel manager to this transaction.
   */
  channelTransactionIndex: bigint

  /**
   * The transaction's the address is sent to.
   */
  to: Address

  /**
   * This will contain the data of the message or the init of a contract.
   */
  data: Uint8Array

  senderPubKey: Uint8Array

  /**
   * Fixed for TokamakL2JS
   */
  v?: bigint

  /**
   * EDDSA randomizer.
   */
  r?: bigint

  /**
   * EDDSA signature.
   */
  s?: bigint
}
