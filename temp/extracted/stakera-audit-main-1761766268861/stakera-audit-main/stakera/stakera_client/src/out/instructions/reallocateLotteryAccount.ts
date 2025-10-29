import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface ReallocateLotteryAccountArgs {
  newSize: BN;
}

export interface ReallocateLotteryAccountAccounts {
  lotteryAccount: PublicKey;
  user: PublicKey;
  systemProgram: PublicKey;
}

export const layout = borsh.struct([borsh.u64("newSize")]);

export function reallocateLotteryAccount(
  args: ReallocateLotteryAccountArgs,
  accounts: ReallocateLotteryAccountAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lotteryAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
  ];
  const identifier = Buffer.from([183, 190, 180, 82, 112, 61, 56, 18]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      newSize: args.newSize,
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
