import create, { State } from "zustand";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const TOKENPROGRAM = new PublicKey(process.env.NEXT_PUBLIC_TOKEN_PROGRAM);
const USDCMINT = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT);
const ASSOCIATEDTOKENPROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_ASSOCIATED_TOKENPROGRAM
);

interface UserSOLBalanceStore extends State {
  solBalance: number;
  usdcBalance: number;
  getUserSOLBalance: (publicKey: PublicKey, connection: Connection) => void;
  getUserUSDCBalance: (publicKey: PublicKey, connection: Connection) => void;

  subscribeToBalanceChanges: (
    publicKey: PublicKey,
    connection: Connection
  ) => void;
}

const useUserSOLBalanceStore = create<UserSOLBalanceStore>((set) => ({
  solBalance: 0,
  usdcBalance: 0,

  getUserSOLBalance: async (publicKey, connection) => {
    let solBalance = 0;
    try {
      solBalance = await connection.getBalance(publicKey, "confirmed");
      solBalance = solBalance / LAMPORTS_PER_SOL;
    } catch (e) {
      console.log(`Error getting balance: `, e);
    }
    set((state) => {
      state.solBalance = solBalance;
      console.log(`Balance updated: `, solBalance);
    });
  },
  getUserUSDCBalance: async (publicKey, connection) => {
    try {
      const usdcAccount = await usdcSplTokenAccountSync(publicKey);
      console.log(`USDC address: `, usdcAccount);

      const accountInfo = await connection.getParsedAccountInfo(usdcAccount);

      // Check if the account data is parsed
      if ("parsed" in accountInfo.value.data) {
        const balance =
          accountInfo.value.data.parsed.info.tokenAmount.uiAmount || 0;
        set((state) => {
          state.usdcBalance = balance;
          console.log(`Balance updated: `, balance);
        });
      } else {
        // Handle the case where account data is not in the expected format
        console.log("Account data is not in parsed format");
        set({ usdcBalance: 0 });
      }
    } catch (e) {
      console.log(`Error getting USDC balance: `, e);
    }
  },

  subscribeToBalanceChanges: (publicKey, connection) => {
    const subscriptionId = connection.onAccountChange(
      publicKey,
      (accountInfo) => {
        const solBalance = accountInfo.lamports / LAMPORTS_PER_SOL;
        set((state) => {
          state.solBalance = solBalance;
          console.log(`Balance updated: `, solBalance);
        });
      }
    );

    // Unsubscribe from balance changes when the component unmounts
    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  },
}));

async function usdcSplTokenAccountSync(walletAddress) {
  const [splTokenAccount] = PublicKey.findProgramAddressSync(
    [walletAddress.toBuffer(), TOKENPROGRAM.toBuffer(), USDCMINT.toBuffer()],
    ASSOCIATEDTOKENPROGRAM
  );
  return splTokenAccount;
}

async function getSplTokenBalance(connection, walletAddress) {
  try {
    console.log("Wallet Address:", walletAddress);

    if (!walletAddress) {
      throw new Error("Wallet address is undefined");
    }

    if (!(walletAddress instanceof PublicKey)) {
      walletAddress = new PublicKey(walletAddress);
    }

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletAddress,
      { programId: TOKENPROGRAM }
    );

    const specificTokenAccounts = tokenAccounts.value.filter(
      (account) => account.account.data.parsed.info.mint === USDCMINT.toString()
    );

    let totalBalance = 0;
    specificTokenAccounts.forEach((account) => {
      totalBalance += account.account.data.parsed.info.tokenAmount.uiAmount;
    });

    return totalBalance;
  } catch (error) {
    console.error("Error fetching SPL token balance:", error);
    throw error;
  }
}

export default useUserSOLBalanceStore;
