import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface DistributeSmallLotteryYieldAccounts {
  lotteryAccount: PublicKey;
  randomnessAccountData: PublicKey;
  user: PublicKey;
  solOracleAccount: PublicKey;
  infOracleAccount: PublicKey;
  infMint: PublicKey;
  poolState: PublicKey;
  whirlpool: PublicKey;
}

export function distributeSmallLotteryYield(
  accounts: DistributeSmallLotteryYieldAccounts,
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
  const identifier = Buffer.from([71, 102, 238, 151, 7, 3, 186, 137]);
  const data = identifier;
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
