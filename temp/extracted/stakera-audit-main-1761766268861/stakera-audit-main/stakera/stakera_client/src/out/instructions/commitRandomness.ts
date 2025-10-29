import {
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { PROGRAM_ID } from "../programId";

export interface CommitRandomnessArgs {
  randomnessAccount: PublicKey;
  smallLottery: boolean;
}

export interface CommitRandomnessAccounts {
  lotteryAccount: PublicKey;
  systemProgram: PublicKey;
  user: PublicKey;
  randomnessAccountData: PublicKey;
}

export const layout = borsh.struct([
  borsh.publicKey("randomnessAccount"),
  borsh.bool("smallLottery"),
]);

export function commitRandomness(
  args: CommitRandomnessArgs,
  accounts: CommitRandomnessAccounts,
  programId: PublicKey = PROGRAM_ID
) {
  const keys: Array<AccountMeta> = [
    { pubkey: accounts.lotteryAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    {
      pubkey: accounts.randomnessAccountData,
      isSigner: false,
      isWritable: false,
    },
  ];
  const identifier = Buffer.from([146, 52, 195, 220, 79, 30, 53, 26]);
  const buffer = Buffer.alloc(1000);
  const len = layout.encode(
    {
      randomnessAccount: args.randomnessAccount,
      smallLottery: args.smallLottery,
    },
    buffer
  );
  const data = Buffer.concat([identifier, buffer]).slice(0, 8 + len);
  const ix = new TransactionInstruction({ keys, programId, data });
  return ix;
}
