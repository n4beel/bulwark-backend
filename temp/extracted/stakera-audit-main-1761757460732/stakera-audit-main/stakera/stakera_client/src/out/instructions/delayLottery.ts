import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface DelayLotteryAccounts {
  lotteryAccount: PublicKey;
  systemProgram: PublicKey;
  user: PublicKey;
  whirlpool: PublicKey;
  infMint: PublicKey;
  poolState: PublicKey;
}

export function delayLottery(
  accounts: DelayLotteryAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lotteryAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    { pubkey: accounts.whirlpool, isSigner: false, isWritable: true },
    { pubkey: accounts.infMint, isSigner: false, isWritable: true },
    { pubkey: accounts.poolState, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([184, 74, 41, 5, 231, 63, 147, 221]);
  const data = identifier;
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
