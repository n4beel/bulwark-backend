import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface DistributeBigLotteryYieldAccounts {
  lotteryAccount: PublicKey;
  randomnessAccountData: PublicKey;
  user: PublicKey;
  solOracleAccount: PublicKey;
  infOracleAccount: PublicKey;
  infMint: PublicKey;
  poolState: PublicKey;
  whirlpool: PublicKey;
}

export function distributeBigLotteryYield(
  accounts: DistributeBigLotteryYieldAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lotteryAccount, isSigner: false, isWritable: true },
    {
      pubkey: accounts.randomnessAccountData,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    { pubkey: accounts.solOracleAccount, isSigner: false, isWritable: false },
    { pubkey: accounts.infOracleAccount, isSigner: false, isWritable: false },
    { pubkey: accounts.infMint, isSigner: false, isWritable: true },
    { pubkey: accounts.poolState, isSigner: false, isWritable: false },
    { pubkey: accounts.whirlpool, isSigner: false, isWritable: true },
  ];
  const identifier = Buffer.from([231, 1, 147, 163, 34, 80, 162, 46]);
  const data = identifier;
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
