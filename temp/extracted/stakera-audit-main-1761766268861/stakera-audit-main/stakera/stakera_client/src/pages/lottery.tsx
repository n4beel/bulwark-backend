import Head from "next/head";
import { FC, useState, useEffect, useCallback } from "react";
import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import debounce from "lodash.debounce";
import { FaCheckCircle } from "react-icons/fa";
import { ClipLoader } from "react-spinners";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@project-serum/anchor";
import { deposit as depositInstruction } from "../out/instructions"; // Update with the correct path
import { withdraw as withdrawInstruction } from "../out/instructions"; // Update with the correct path
import { withdrawWithRatioLoss as withdrawwithLossInstruction } from "../out/instructions"; // Update with the correct path
import { withdrawTeamYield as withdrawTeamYield } from "../out/instructions"; // Update with the correct path
import Decimal from "decimal.js";
import { usePriorityFee } from "../contexts/PriorityFee";
import { PROGRAM_ID } from "../out/programId";
import { notify } from "utils/notifications";
import useUserSOLBalanceStore from "../stores/useUserSOLBalanceStore";
import {
  buildWhirlpoolClient,
  SwapUtils,
  PDAUtil,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  WhirlpoolContext,
  WhirlpoolAccountFetcher,
  TickUtil,
  PriceMath,
  swapQuoteByInputToken,
  swapQuoteByOutputToken,
  IGNORE_CACHE,
} from "@orca-so/whirlpools-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import axios from "axios";
import {
  LotteryAccount,
  LotteryAccountJSON,
} from "../out/accounts/LotteryAccount";
import { ParticipantJSON } from "../out/types/Participant";
import dynamic from "next/dynamic";
import holderList from "./holders.json";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

interface UserWinnings {
  _id: string;
  user: string;
  smallWinnings: number;
  bigWinnings: number;

  // Add other properties if they exist
}

const lotteryAccount = new PublicKey(
  "9aFmbWZuMbCQzMyNqsTB4umen9mpnqL6Z6a4ypis3XzW"
); // Replace with actual account
const pdaHouseAcc = new PublicKey(
  "FnxstpbQKMYW3Jw7SY5outhEiHGDkg7GUpoCVt9nVuHJ"
); // Replace with actual account
const whirlpoolProgram = new PublicKey(ORCA_WHIRLPOOL_PROGRAM_ID);
const tokenProgram = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
); // Replace with actual account
const tokenOwnerAccountA = new PublicKey(
  "5UwRe6CoRZLJYJSd8GcbaXKrFCHbjYeRUdKSRpqRtkMH"
); // Replace with actual account
const tokenVaultA = new PublicKey(
  "9sxSBQ3bS35VgV736MaSJRX11MfZHXxTdU4Pc1JfA5ML"
); // Replace with actual account
const tokenOwnerAccountB = new PublicKey(
  "ESXQ1jcH2CzchJR3oqYfsxJU9evGM14Fg5gaJPFXSvoX"
); // Replace with actual account
const tokenVaultB = new PublicKey(
  "FZKgBhFkwNwsJLx3GXHHW8XPi8NMiJX791wweHBKaPcP"
); // Replace with actual account
const whirlpoolAddress = new PublicKey(
  "DxD41srN8Xk9QfYjdNXF9tTnP6qQxeF2bZF8s1eN62Pe"
);
const oraclePDA = PDAUtil.getOracle(
  ORCA_WHIRLPOOL_PROGRAM_ID,
  whirlpoolAddress
);

const ENDPOINT5 = process.env.NEXT_PUBLIC_ENDPOINT5;

const fetchAPY = async () => {
  try {
    const response = await axios.get(
      "https://sanctum-extra-api.ngrok.dev/v1/apy/latest?lst=INF"
    );
    if (response.status === 200 && response.data && response.data.apys) {
      return response.data.apys.INF; // Assuming you need the APY for "INF"
    } else {
      console.error("APY data is not available or API request failed");
      return null;
    }
  } catch (error) {
    console.error("Error fetching APY:", error);
    return null;
  }
};

const fetchCurrentValue = async () => {
  try {
    const response = await axios.get(
      "https://sanctum-extra-api.ngrok.dev/v1/sol-value/current?lst=INF"
    );
    if (response.status === 200 && response.data && response.data.solValues) {
      return response.data.solValues.INF; // Returning the value for "INF"
    } else {
      console.error("SOL value data is not available or API request failed");
      return null;
    }
  } catch (error) {
    console.error("Error fetching SOL value:", error);
    return null;
  }
};

const calculateValue = (value, multiplier) => {
  return value * multiplier;
};

async function checkLotteryAccount(
  connection: Connection
): Promise<LotteryAccountJSON> {
  const lotteryAcc = new PublicKey(
    "9aFmbWZuMbCQzMyNqsTB4umen9mpnqL6Z6a4ypis3XzW"
  ); // Replace with actual account
  const lotteryAccount = await LotteryAccount.fetch(connection, lotteryAcc);

  if (!lotteryAccount) {
    return {
      isInitialized: false,
      totalDeposits: "0",
      lstTotalDeposits: "0",
      participants: [],
      smallCommitSlot: "0",
      smallRandomnessAccount: "0",
      bigLotteryTime: "0",
      bigLotteryHappened: false,
      smallLotteryTime: "0",
      smallLotteryHappened: false,
      bigCommitSlot: "0",
      bigRandomnessAccount: "0",
      teamYield: "0",
      bigLotteryYield: "0",
      smallLotteryToBig: 0,
    };
  }

  return lotteryAccount.toJSON();
}

require("dotenv").config();

const Lottery: FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const balance = useUserSOLBalanceStore((s) => s.solBalance);
  const usdcbalance = useUserSOLBalanceStore((s) => s.usdcBalance);
  const { getUserSOLBalance, getUserUSDCBalance } = useUserSOLBalanceStore();
  const [amount, setAmount] = useState("");
  const [displeyAmount, setDispleyAmount] = useState("");

  const [otherAmountThreshold, setOtherAmountThreshold] = useState(0);
  const [sqrtPriceLimit, setSqrtPriceLimit] = useState(0);
  const [amountSpecifiedIsInput, setAmountSpecifiedIsInput] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<Decimal | null>(null);
  const [swapQuote, setSwapQuote] = useState<any>(null);
  const [swapQuoteOut, setSwapQuoteOut] = useState<any>(null);
  const [swapQuoteOutLoss, setSwapQuoteOutLoss] = useState<any>(null);
  const [lotteryAccountData, setLotteryAccountData] =
    useState<LotteryAccountJSON | null>(null);
  const [participantData, setParticipantData] =
    useState<ParticipantJSON | null>(null);

  const [whirlpool, setWhirlpool] = useState<any>(null);
  const [aToB, setAToB] = useState(true);
  const wallet = useWallet();
  const [slippageTolerance, setSlippageTolerance] = useState(30); // Default to 0.1%
  const [activeButton, setActiveButton] = useState(2);
  const [customSlippage, setCustomSlippage] = useState("");
  const { isPriorityFee, setPriorityFee } = usePriorityFee();
  const [selectedStake, setSelectedStake] = useState<"DEPOSIT" | "WITHDRAW">(
    "DEPOSIT"
  );
  const [showAdditionalDiv1, setShowAdditionalDiv1] = useState(false);
  const [loading, setLoading] = useState(false);

  const [remainingTimeSmallLottery, setRemainingTimeSmallLottery] = useState<
    number | null
  >(null);
  const [remainingTimeBigLottery, setRemainingTimeBigLottery] = useState<
    number | null
  >(null);
  const [totalTimeSmallLottery, setTotalTimeSmallLottery] = useState<
    number | null
  >(null);
  const [totalTimeBigLottery, setTotalTimeBigLottery] = useState<number | null>(
    null
  );

  const [smallLotteryWinners, setSmallLotteryWinners] = useState([]);
  const [bigLotteryWinners, setBigLotteryWinners] = useState([]);
  const [userWinnings, setUserWinnings] = useState<UserWinnings | null>(null);

  const [smallLotteryYield, setSmallLotteryYield] = useState(null);
  const [bigLotteryYield, setBigLotteryYield] = useState(null);
  const [apyValue, setApyValue] = useState(null);
  const [isYieldCalculated, setIsYieldCalculated] = useState(false);

  // New toggle state, starting with true by default
  const [depegProtectionState, setDepegProtectionState] = useState(true);

  const multiplier = 0.9;
  const result =
    apyValue !== null ? calculateValue(apyValue * 100, multiplier) : null; // Convert to percentage

  const formatPublicKey = (pubKey) => {
    if (!pubKey) return "";
    return `${pubKey.slice(0, 3)}...${pubKey.slice(-3)}`;
  };

  useEffect(() => {
    const getAPY = async () => {
      const apy = await fetchAPY();
      if (apy !== null) {
        setApyValue(apy);
      }
    };
    getAPY();
  }, []);

  function calculateAdjustedValue(
    infsol: number,
    lstDeposits: number,
    totalDeposits: number
  ): number {
    // Calculate the difference and the INF to SOL value
    const adjustedValue = infsol * lstDeposits - totalDeposits;

    if (adjustedValue > 0) {
      // Multiply by 0.9 if adjustedValue is greater than 0
      return adjustedValue * 0.9;
    } else {
      // Return the adjustedValue as is
      return adjustedValue;
    }
  }

  const calculateYield = async () => {
    const apy_raw = await fetchAPY();
    const apy = apy_raw * 0.9;
    if (
      !apy_raw ||
      !remainingTimeSmallLottery ||
      !remainingTimeBigLottery ||
      isYieldCalculated
    ) {
      return;
    }

    const { whirlpool, price } = await getWhirlpoolData(whirlpoolAddress);

    if (apy !== null && price !== null && lotteryAccountData) {
      const lstDeposits = Number(lotteryAccountData.lstTotalDeposits);
      const totalDeposits = Number(lotteryAccountData.totalDeposits);
      const infsol = ((1 / price.toNumber()) * 9999) / 10000;

      console.log("orca price", infsol);
      console.log("lst/total", totalDeposits / lstDeposits);

      // Calculate the difference and the INF to SOL value
      const adjustedValue = calculateAdjustedValue(
        infsol,
        lstDeposits,
        totalDeposits
      );

      console.log("adj value", adjustedValue);

      // Calculate small lottery yield using remaining time
      if (remainingTimeSmallLottery) {
        const smallAPY = calculateLotteryAPY(apy, remainingTimeSmallLottery);
        let smallYield = (smallAPY * totalDeposits + adjustedValue) / 2;
        smallYield = smallYield < 0 ? 0 : smallYield; // Set to 0 if below 0
        console.log("Small Lottery Yield:", smallYield);
        setSmallLotteryYield(smallYield);
      }

      // Calculate big lottery yield using remaining time
      if (remainingTimeBigLottery) {
        const bigAPY = calculateLotteryAPY(apy, remainingTimeBigLottery);
        let bigYield = (bigAPY * totalDeposits + adjustedValue) / 2;
        bigYield = bigYield < 0 ? 0 : bigYield; // Set to 0 if below 0
        console.log("Big Lottery Yield:", bigYield);
        setBigLotteryYield(bigYield);
      }
      setIsYieldCalculated(true);
    }
  };

  useEffect(() => {
    if (lotteryAccountData) {
      calculateYield();
    }

    // Reset isYieldCalculated to false every X milliseconds
    const resetYieldCalculation = setInterval(() => {
      setIsYieldCalculated(false);
    }, 600000); // Reset every 60 seconds

    return () => clearInterval(resetYieldCalculation);
  }, [lotteryAccountData, remainingTimeSmallLottery, remainingTimeBigLottery]);

  // start

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  // Load the list of holders
  const [allowedHolders, setAllowedHolders] = useState<string[]>([]);

  useEffect(() => {
    const loadHolders = async () => {
      // Simulate loading JSON from uploaded file
      const holders = holderList; // Replace this with the actual method to load the JSON file
      setAllowedHolders(holders);
    };

    loadHolders();
  }, []);

  // Check if the connected wallet is in the list
  useEffect(() => {
    if (publicKey && allowedHolders.length > 0) {
      const publicKeyString = publicKey.toString();
      const isAllowed = allowedHolders.includes(publicKeyString);
      setHasAccess(isAllowed);
    }
  }, [publicKey, allowedHolders]);

  // end

  useEffect(() => {
    if (!lotteryAccountData) {
      console.log("Waiting for lotteryAccountData...");
      return; // Exit early if lotteryAccountData is not yet available
    }

    const smallLotteryEndTime = Number(lotteryAccountData?.smallLotteryTime);
    const smallLotteryStartTime = smallLotteryEndTime - 60 * 60 * 24 * 7; // Adjust based on your requirements

    const bigLotteryEndTime = Number(lotteryAccountData?.bigLotteryTime);
    const bigLotteryStartTime = bigLotteryEndTime - 4 * 60 * 60 * 24 * 7; // Adjust based on your requirements

    const updateRemainingTimes = async () => {
      try {
        let currentTime = new Date().getTime() / 1000;

        if (currentTime !== null) {
          const now = Math.floor(currentTime); // Use Solana time as Unix timestamp

          const remainingTimeSmallLottery = smallLotteryEndTime - now;
          const remainingTimeBigLottery = bigLotteryEndTime - now;
          const totalTimeSmallLottery =
            smallLotteryEndTime - smallLotteryStartTime;
          const totalTimeBigLottery = bigLotteryEndTime - bigLotteryStartTime;

          setRemainingTimeSmallLottery(remainingTimeSmallLottery);
          setRemainingTimeBigLottery(remainingTimeBigLottery);
          setTotalTimeSmallLottery(totalTimeSmallLottery);
          setTotalTimeBigLottery(totalTimeBigLottery);
        } else {
          console.error("Failed to retrieve Solana block time.");
        }
      } catch (error) {
        console.error("Error fetching Solana time:", error);
      }
    };

    updateRemainingTimes();
    const interval = setInterval(updateRemainingTimes, 1000);

    return () => clearInterval(interval);
  }, [lotteryAccountData]);

  const getPercentage = (
    remainingTime: number | null,
    totalTime: number | null
  ) => {
    if (remainingTime === null || totalTime === null) return 0;
    return ((totalTime - remainingTime) / totalTime) * 100;
  };

  const smallLotteryPercentage = getPercentage(
    remainingTimeSmallLottery,
    totalTimeSmallLottery
  );
  const bigLotteryPercentage = getPercentage(
    remainingTimeBigLottery,
    totalTimeBigLottery
  );

  const getBackgroundStyle = (
    percentage: number,
    color1: string,
    color2: string
  ) => {
    return {
      background: `linear-gradient(to right, ${color1} ${percentage}%, ${color2} ${percentage}%)`,
    };
  };

  const smallLotteryBgStyle = getBackgroundStyle(
    smallLotteryPercentage,
    "#6fff90",
    "#255146"
  ); // Adjust colors as needed
  const bigLotteryBgStyle = getBackgroundStyle(
    bigLotteryPercentage,
    "#7363f3",
    "#255146"
  ); // Adjust colors as needed

  const formatRemainingTime = (seconds: number) => {
    if (seconds < 0) {
      return `0D 0H 0M 0S`;
    }

    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = seconds % 60;

    return `${days}D ${hours}H ${minutes}M ${secs}S`;
  };

  const handleButtonClick = (buttonIndex: number) => {
    setActiveButton(buttonIndex);
    // setShowAdditionalDiv1(!showAdditionalDiv1);

    switch (buttonIndex) {
      case 1:
        setSlippageTolerance(10); // 0.1%
        break;
      case 2:
        setSlippageTolerance(30); // 0.3%
        break;
      case 3:
        setSlippageTolerance(50); // 0.5%
        break;
      default:
      // Handle default case if necessary
    }

    // Clear any custom slippage value
    setCustomSlippage("");
  };

  useEffect(() => {
    if (publicKey) {
      getUserSOLBalance(publicKey, connection);
      getUserUSDCBalance(publicKey, connection);
    }
  }, [publicKey, connection]);

  const fetchLotteryAccountData = async () => {
    try {
      const data = await checkLotteryAccount(connection);
      console.log("rawdata", data);
      setLotteryAccountData(data);
    } catch (error) {
      console.error("Error fetching lottery account data:", error);
    }
  };

  const fetchParticipantData = async () => {
    try {
      const data = await checkLotteryAccount(connection);
      const participant = data.participants.find(
        (participant) => participant.pubkey === publicKey.toString()
      );
      setParticipantData(participant || null);
    } catch (error) {
      console.error("Error fetching lottery account data:", error);
    }
  };

  // myslet na to!
  useEffect(() => {
    fetchLotteryAccountData();
  }, [connection]);

  // myslet na to!
  useEffect(() => {
    if (publicKey) {
      setTimeout(() => {
        fetchParticipantData();
      }, 150);
    }
  }, [publicKey, connection]);

  const getPriorityFeeEstimate = async () => {
    try {
      const rpcUrl = ENDPOINT5;

      const requestData = {
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            accountKeys: [
              "StkraNY8rELLLoDHmVg8Di8DKTLbE8yAWZqRR9w413n",
              "DxD41srN8Xk9QfYjdNXF9tTnP6qQxeF2bZF8s1eN62Pe",
            ],
            options: {
              includeAllPriorityFeeLevels: true,
            },
          },
        ],
      };

      const response = await axios.post(rpcUrl, requestData);

      if (response.status !== 200) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const responseData = response.data;
      if (responseData.error) {
        throw new Error(
          `RPC error! Code: ${responseData.error.code}, Message: ${responseData.error.message}`
        );
      }

      return responseData.result.priorityFeeLevels.veryHigh.toFixed(0);
    } catch (error) {
      console.error("Error fetching priority fee estimate:", error);
    }
  };

  const handleToggle = () => {
    // Update the isPriorityFee state when the toggle button is clicked
    setDepegProtectionState(!depegProtectionState);
  };

  // const fetcher = new WhirlpoolAccountFetcher(connection);

  const getWhirlpoolClient = useCallback(() => {
    const ctx = WhirlpoolContext.from(
      connection,
      wallet,
      ORCA_WHIRLPOOL_PROGRAM_ID
    );
    const client = buildWhirlpoolClient(ctx);
    return client;
  }, [connection, wallet]);

  const getWhirlpoolData = useCallback(
    async (whirlpoolAddress: PublicKey) => {
      const client = getWhirlpoolClient();
      const whirlpool = await client.getPool(whirlpoolAddress);
      const sqrtPriceX64 = whirlpool.getData().sqrtPrice;
      const price = PriceMath.sqrtPriceX64ToPrice(sqrtPriceX64, 9, 9); // Update decimals based on token pairs
      return { whirlpool, price };
    },
    [getWhirlpoolClient]
  );

  const getSwapQuote = useCallback(
    async (whirlpool: any, amountIn: Decimal, slippage: Number) => {
      const ctx = WhirlpoolContext.from(
        connection,
        wallet,
        ORCA_WHIRLPOOL_PROGRAM_ID
      );
      const quote = await swapQuoteByInputToken(
        whirlpool,
        new PublicKey("So11111111111111111111111111111111111111112"), // Update with your input token mint
        DecimalUtil.toBN(amountIn, 9), // Update decimals based on token pairs
        Percentage.fromFraction(slippage, 10000),
        ctx.program.programId,
        ctx.fetcher,
        IGNORE_CACHE
      );
      return quote;
    },
    [connection, wallet]
  );

  const getSwapQuoteOutput = useCallback(
    async (whirlpool: any, amountOut: Decimal, slippage: number) => {
      const ctx = WhirlpoolContext.from(
        connection,
        wallet,
        ORCA_WHIRLPOOL_PROGRAM_ID
      );
      const quote = await swapQuoteByOutputToken(
        whirlpool,
        new PublicKey("So11111111111111111111111111111111111111112"), // Update with your output token mint
        DecimalUtil.toBN(amountOut, 9), // Update decimals based on token pairs
        Percentage.fromFraction(slippage, 10000),
        ctx.program.programId,
        ctx.fetcher,
        IGNORE_CACHE
      );
      return quote;
    },
    [connection, wallet]
  );

  const getSwapQuoteOutputLoss = useCallback(
    async (whirlpool: any, amountOut: Decimal, slippage: number) => {
      const ctx = WhirlpoolContext.from(
        connection,
        wallet,
        ORCA_WHIRLPOOL_PROGRAM_ID
      );
      const quote = await swapQuoteByInputToken(
        whirlpool,
        new PublicKey("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm"), // Update with your output token mint
        DecimalUtil.toBN(amountOut, 9), // Update decimals based on token pairs
        Percentage.fromFraction(slippage, 1000),
        ctx.program.programId,
        ctx.fetcher,
        IGNORE_CACHE
      );
      return quote;
    },
    [connection, wallet]
  );

  const fetchWhirlpoolData = async () => {
    setLoading(true);
    try {
      const { whirlpool, price } = await getWhirlpoolData(whirlpoolAddress);
      setWhirlpool(whirlpool);
      setCurrentPrice(price);

      const amountIn = new Decimal(amount);
      const PriceN = new Decimal(price);
      const amountOut = amountIn.times(PriceN);
      const amountOutQuote = new Decimal(amountOut);

      const quote = await getSwapQuote(whirlpool, amountIn, slippageTolerance);
      const quoteOut = await getSwapQuoteOutput(
        whirlpool,
        amountIn,
        slippageTolerance
      );
      const quoteOutLoss = await getSwapQuoteOutputLoss(
        whirlpool,
        amountOutQuote,
        slippageTolerance
      );

      const formattedQuote = decodeSwapQuote(quote);
      const formattedQuoteOut = decodeSwapQuote(quoteOut);
      const formattedQuoteOutLoss = decodeSwapQuote(quoteOutLoss);

      setSwapQuote(formattedQuote);
      setSwapQuoteOut(formattedQuoteOut);
      setSwapQuoteOutLoss(formattedQuoteOutLoss);

      console.log("Current Pool Price:", price.toFixed(9));
      console.log("Formatted Swap Quote:", formattedQuote);
      console.log("Formatted Swap Quote Out:", formattedQuoteOut);
      console.log("Formatted Swap Quote Out Loss:", formattedQuoteOutLoss);
    } catch (error) {
      console.error("Failed to fetch whirlpool data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced version of fetchWhirlpoolData
  const debouncedFetchWhirlpoolData = useCallback(
    debounce(fetchWhirlpoolData, 400), // 500ms debounce
    [amount, slippageTolerance, whirlpoolAddress]
  );

  useEffect(() => {
    debouncedFetchWhirlpoolData();

    // Cleanup debounce on unmount
    return () => {
      debouncedFetchWhirlpoolData.cancel();
    };
  }, [debouncedFetchWhirlpoolData]);

  const decodeSwapQuote = (quote) => {
    return {
      estimatedAmountIn: quote.estimatedAmountIn.toString(),
      estimatedAmountOut: quote.estimatedAmountOut.toString(),
      estimatedEndTickIndex: quote.estimatedEndTickIndex,
      estimatedEndSqrtPrice: quote.estimatedEndSqrtPrice.toString(),
      estimatedFeeAmount: quote.estimatedFeeAmount.toString(),
      aToB: quote.aToB,
      amount: quote.amount.toString(),
      amountSpecifiedIsInput: quote.amountSpecifiedIsInput,
      otherAmountThreshold: quote.otherAmountThreshold.toString(),
      sqrtPriceLimit: quote.sqrtPriceLimit.toString(),
      tickArray0: quote.tickArray0.toBase58(),
      tickArray1: quote.tickArray1.toBase58(),
      tickArray2: quote.tickArray2.toBase58(),
      transferFee: {
        deductingFromEstimatedAmountIn:
          quote.transferFee.deductingFromEstimatedAmountIn.toString(),
        deductedFromEstimatedAmountOut:
          quote.transferFee.deductedFromEstimatedAmountOut.toString(),
      },
    };
  };

  // const startTick = TickUtil.getStartTickIndex(      whirlpool.getData().tickCurrentIndex,
  // whirlpool.getData().tickSpacing,);
  // // const tickArrayKey = PDAUtil.getTickArray(ORCA_WHIRLPOOL_PROGRAM_ID, whirlpoolAddress, startTick);

  // // const tickArrays = await SwapUtils.getTickArrays(
  // //   whirlpool.getData().tickCurrentIndex,
  // //   whirlpool.getData().tickSpacing,
  // //   aToB,
  // //   ctx.program.programId,
  // //   whirlpoolAddress,
  // //   fetcher,
  // //   true
  // // );

  const handleDeposit = async (e) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(button.clientWidth, button.clientHeight);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const newWave = {
      x,
      y,
      size,
      key: Date.now(), // Use a unique key for each wave
    };

    const { whirlpool, price } = await getWhirlpoolData(whirlpoolAddress);

    const quote = await getSwapQuote(
      whirlpool,
      new Decimal(amount),
      slippageTolerance
    );

    const formattedQuote = decodeSwapQuote(quote);
    setSwapQuote(formattedQuote);

    setWaves((prevWaves) => [...prevWaves, newWave]);

    // Remove the wave after animation ends
    setTimeout(() => {
      setWaves((prevWaves) =>
        prevWaves.filter((wave) => wave.key !== newWave.key)
      );
    }, 600);
    if (!publicKey) {
      notify({ type: "error", message: "Wallet not connected!" });
      return;
    }

    const depositArgs = {
      amount: new BN(swapQuote.estimatedAmountIn),
      otherAmountThreshold: new BN(swapQuote.otherAmountThreshold),
      sqrtPriceLimit: new BN(swapQuote.sqrtPriceLimit),
      amountSpecifiedIsInput: true,
      aToB: true,
      slippage: new BN(slippageTolerance),
      depegProtection: depegProtectionState,
    };

    const depositAccounts = {
      lotteryAccount,
      user: publicKey,
      pdaHouseAcc,
      systemProgram: SystemProgram.programId,
      whirlpoolProgram,
      tokenProgram,
      whirlpool: whirlpoolAddress,
      tokenOwnerAccountA,
      tokenVaultA,
      tokenOwnerAccountB,
      tokenVaultB,
      tickArray0: new PublicKey(swapQuote.tickArray0),
      tickArray1: new PublicKey(swapQuote.tickArray1),
      tickArray2: new PublicKey(swapQuote.tickArray2),
      oracle: oraclePDA.publicKey,
      wsolMint: new PublicKey("So11111111111111111111111111111111111111112"),
      associatedTokenProgram: new PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      ),
      solOracleAccount: new PublicKey(
        "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
      ),
      infOracleAccount: new PublicKey(
        "Ceg5oePJv1a6RR541qKeQaTepvERA3i8SvyueX9tT8Sq"
      ),
      infMint: new PublicKey("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm"),
      poolState: new PublicKey("AYhux5gJzCoeoc1PoJ1VxwPDe22RwcvpHviLDD1oCGvW"),
    };
    let PRIORITY_FEE_IX;

    console.log("depositAcc", JSON.stringify(depositArgs, null, 2));
    console.log("depositAcc", JSON.stringify(depositAccounts, null, 2));

    if (isPriorityFee) {
      const priorityfees = await getPriorityFeeEstimate();
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityfees,
      });
    } else {
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 0,
      });
    }

    const COMPUTE_BUDGET_IX = ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000,
    });

    try {
      const ix = depositInstruction(depositArgs, depositAccounts);
      const tx = new Transaction()
        .add(COMPUTE_BUDGET_IX)
        .add(ix)
        .add(PRIORITY_FEE_IX);
      const signature = await sendTransaction(tx, connection);
      notify({
        type: "info",
        message: "Deposit transaction sent!",
        txid: signature,
      });
      await connection.confirmTransaction(signature, "processed");
      notify({
        type: "success",
        message: "Deposit transaction successful!",
        txid: signature,
      });
      setTimeout(() => {
        fetchLotteryAccountData();
        fetchParticipantData();
      }, 1500);
    } catch (error) {
      console.error(error);
      notify({
        type: "error",
        message: "Deposit transaction failed!",
        description: error.message,
      });
    }
  };

  const handleWithdraw = async () => {
    if (!publicKey) {
      notify({ type: "error", message: "Wallet not connected!" });
      return;
    }

    const withdrawArgs = {
      amount: new BN(swapQuoteOut.estimatedAmountOut),
      otherAmountThreshold: new BN(swapQuoteOut.otherAmountThreshold),
      sqrtPriceLimit: new BN(swapQuoteOut.sqrtPriceLimit),
      amountSpecifiedIsInput: false,
      aToB: false,
      slippage: new BN(slippageTolerance),
      depegProtection: depegProtectionState,
    };

    console.log("args", withdrawArgs);

    const withdrawAccounts = {
      lotteryAccount,
      user: publicKey,
      pdaHouseAcc,
      systemProgram: SystemProgram.programId,
      whirlpoolProgram,
      tokenProgram,
      whirlpool: whirlpoolAddress,
      tokenOwnerAccountA,
      tokenVaultA,
      tokenOwnerAccountB,
      tokenVaultB,
      tickArray0: new PublicKey(swapQuoteOut.tickArray0),
      tickArray1: new PublicKey(swapQuoteOut.tickArray1),
      tickArray2: new PublicKey(swapQuoteOut.tickArray2),
      oracle: oraclePDA.publicKey,
      wsolMint: new PublicKey("So11111111111111111111111111111111111111112"),
      associatedTokenProgram: new PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      ),
      solOracleAccount: new PublicKey(
        "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
      ),
      infOracleAccount: new PublicKey(
        "Ceg5oePJv1a6RR541qKeQaTepvERA3i8SvyueX9tT8Sq"
      ),
      infMint: new PublicKey("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm"),
      poolState: new PublicKey("AYhux5gJzCoeoc1PoJ1VxwPDe22RwcvpHviLDD1oCGvW"),
    };

    let PRIORITY_FEE_IX;

    if (isPriorityFee) {
      const priorityfees = await getPriorityFeeEstimate();
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityfees,
      });
    } else {
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 0,
      });
    }

    const COMPUTE_BUDGET_IX = ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000,
    });

    try {
      const ix = withdrawInstruction(withdrawArgs, withdrawAccounts);
      const tx = new Transaction()
        .add(COMPUTE_BUDGET_IX)
        .add(ix)
        .add(PRIORITY_FEE_IX);
      const signature = await sendTransaction(tx, connection);
      notify({
        type: "info",
        message: "Withdraw transaction sent!",
        txid: signature,
      });
      await connection.confirmTransaction(signature, "processed");
      notify({
        type: "success",
        message: "Withdraw transaction successful!",
        txid: signature,
      });
      setTimeout(() => {
        fetchLotteryAccountData();
        fetchParticipantData();
      }, 1500);
    } catch (error) {
      console.error(error);
      notify({
        type: "error",
        message: "Withdraw transaction failed!",
        description: error.message,
      });
    }
  };

  const handleTeamWithdraw = async () => {
    if (!publicKey) {
      notify({ type: "error", message: "Wallet not connected!" });
      return;
    }

    console.log(new Decimal(lotteryAccountData?.teamYield));
    console.log(lotteryAccountData.teamYield);

    const quoteOut = await getSwapQuoteOutput(
      whirlpool,
      new Decimal(Number(lotteryAccountData.teamYield) / LAMPORTS_PER_SOL),
      slippageTolerance
    );

    const withdrawArgs = {
      amount: new BN(quoteOut.estimatedAmountOut),
      otherAmountThreshold: new BN(quoteOut.otherAmountThreshold),
      sqrtPriceLimit: new BN(quoteOut.sqrtPriceLimit),
      amountSpecifiedIsInput: false,
      aToB: false,
      slippage: new BN(slippageTolerance),
    };

    const withdrawAccounts = {
      lotteryAccount,
      user: publicKey,
      pdaHouseAcc,
      systemProgram: SystemProgram.programId,
      whirlpoolProgram,
      tokenProgram,
      whirlpool: whirlpoolAddress,
      tokenOwnerAccountA,
      tokenVaultA,
      tokenOwnerAccountB,
      tokenVaultB,
      tickArray0: new PublicKey(quoteOut.tickArray0),
      tickArray1: new PublicKey(quoteOut.tickArray1),
      tickArray2: new PublicKey(quoteOut.tickArray2),
      oracle: oraclePDA.publicKey,
      wsolMint: new PublicKey("So11111111111111111111111111111111111111112"),
      associatedTokenProgram: new PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      ),
      solOracleAccount: new PublicKey(
        "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
      ),
      infOracleAccount: new PublicKey(
        "Ceg5oePJv1a6RR541qKeQaTepvERA3i8SvyueX9tT8Sq"
      ),
      infMint: new PublicKey("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm"),
      poolState: new PublicKey("AYhux5gJzCoeoc1PoJ1VxwPDe22RwcvpHviLDD1oCGvW"),
    };

    let PRIORITY_FEE_IX;

    if (isPriorityFee) {
      const priorityfees = await getPriorityFeeEstimate();
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityfees,
      });
    } else {
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 0,
      });
    }

    const COMPUTE_BUDGET_IX = ComputeBudgetProgram.setComputeUnitLimit({
      units: 3000000,
    });

    try {
      const ix = withdrawTeamYield(withdrawArgs, withdrawAccounts);
      const tx = new Transaction()
        .add(COMPUTE_BUDGET_IX)
        .add(ix)
        .add(PRIORITY_FEE_IX);
      const signature = await sendTransaction(tx, connection);
      notify({
        type: "info",
        message: "Withdraw transaction sent!",
        txid: signature,
      });
      await connection.confirmTransaction(signature, "processed");
      notify({
        type: "success",
        message: "Withdraw transaction successful!",
        txid: signature,
      });
      setTimeout(() => {
        fetchLotteryAccountData();
        fetchParticipantData();
      }, 1500);
    } catch (error) {
      console.error(error);
      notify({
        type: "error",
        message: "Withdraw transaction failed!",
        description: error.message,
      });
    }
  };

  const handleWithdrawWithLoss = async (amount) => {
    if (!publicKey) {
      notify({ type: "error", message: "Wallet not connected!" });
      return;
    }

    const withdrawArgs = {
      amount: new BN(amount),
      otherAmountThreshold: new BN(swapQuoteOutLoss.otherAmountThreshold),
      sqrtPriceLimit: new BN(swapQuoteOutLoss.sqrtPriceLimit),
      amountSpecifiedIsInput: true,
      aToB: false,
      slippage: new BN(slippageTolerance),
      depegProtection: depegProtectionState,
    };

    console.log("args", withdrawArgs);

    const withdrawAccounts = {
      lotteryAccount,
      user: publicKey,
      pdaHouseAcc,
      systemProgram: SystemProgram.programId,
      whirlpoolProgram,
      tokenProgram,
      whirlpool: whirlpoolAddress,
      tokenOwnerAccountA,
      tokenVaultA,
      tokenOwnerAccountB,
      tokenVaultB,
      tickArray0: new PublicKey(swapQuoteOutLoss.tickArray0),
      tickArray1: new PublicKey(swapQuoteOutLoss.tickArray1),
      tickArray2: new PublicKey(swapQuoteOutLoss.tickArray2),
      oracle: oraclePDA.publicKey,
      wsolMint: new PublicKey("So11111111111111111111111111111111111111112"),
      associatedTokenProgram: new PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      ),
      solOracleAccount: new PublicKey(
        "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
      ),
      infOracleAccount: new PublicKey(
        "Ceg5oePJv1a6RR541qKeQaTepvERA3i8SvyueX9tT8Sq"
      ),
      infMint: new PublicKey("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm"),
      poolState: new PublicKey("AYhux5gJzCoeoc1PoJ1VxwPDe22RwcvpHviLDD1oCGvW"),
    };

    let PRIORITY_FEE_IX;

    if (isPriorityFee) {
      const priorityfees = await getPriorityFeeEstimate();
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityfees,
      });
    } else {
      PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 0,
      });
    }

    const COMPUTE_BUDGET_IX = ComputeBudgetProgram.setComputeUnitLimit({
      units: 250000,
    });

    try {
      const ix = withdrawwithLossInstruction(withdrawArgs, withdrawAccounts);
      const tx = new Transaction()
        .add(COMPUTE_BUDGET_IX)
        .add(ix)
        .add(PRIORITY_FEE_IX);
      const signature = await sendTransaction(tx, connection);
      notify({
        type: "info",
        message: "Withdraw transaction sent!",
        txid: signature,
      });
      await connection.confirmTransaction(signature, "processed");
      notify({
        type: "success",
        message: "Withdraw transaction successful!",
        txid: signature,
      });
      setTimeout(() => {
        fetchLotteryAccountData();
        fetchParticipantData();
      }, 1500);
    } catch (error) {
      console.error(error);
      notify({
        type: "error",
        message: "Withdraw transaction failed!",
        description: error.message,
      });
    }
  };

  // const handleCustomSlippageChange = (event) => {
  //   const customValue = event.target.value;

  //   // Replace comma with dot, and remove non-numeric characters except dot (.) as decimal separator
  //   const preNumericValue = customValue.replace(/,/g, ".");
  //   const customValues = preNumericValue.replace(/[^0-9.]/g, "");

  //   // Count the occurrences of dot (.)
  //   const dotCount = (customValues.match(/\./g) || []).length;
  //   let sanitizedValue = customValues;
  //   // If there is more customValues one dot, keep only the portion before the second dot
  //   if (dotCount > 1) {
  //     sanitizedValue = sanitizedValue.substring(
  //       0,
  //       sanitizedValue.indexOf(".") + sanitizedValue.split(".")[1].length + 1
  //     );
  //   }

  //   // Update custom slippage state
  //   setCustomSlippage(sanitizedValue);

  //   // Convert to a number for validation
  //   const customTolerance = Number(sanitizedValue);

  //   // If the custom value is valid, update the slippage tolerance
  //   if (!isNaN(customTolerance) && customTolerance > 0) {
  //     setSlippageTolerance(customTolerance * 100); // Assuming the input is in percentage
  //     setActiveButton(4); // Deselect any active button
  //   }
  // };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    // Replace comma with dot, and remove non-numeric characters except dot (.) as decimal separator
    const preNumericValue = inputValue.replace(/,/g, ".");
    const numericValue = preNumericValue.replace(/[^0-9.]/g, "");

    // Count the occurrences of dot (.)
    const dotCount = (numericValue.match(/\./g) || []).length;

    // If there is more than one dot, keep only the portion before the second dot
    let sanitizedValue = numericValue;
    if (dotCount > 1) {
      sanitizedValue = sanitizedValue.substring(
        0,
        sanitizedValue.lastIndexOf(".")
      );
    }

    // Set the sanitized value as the amount value
    setAmount(sanitizedValue);
    setDispleyAmount(sanitizedValue);
  };

  const [waves, setWaves] = useState([]);

  const handleWithdrawDecision = async (e) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(button.clientWidth, button.clientHeight);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const newWave = {
      x,
      y,
      size,
      key: Date.now(), // Use a unique key for each wave
    };

    setWaves((prevWaves) => [...prevWaves, newWave]);

    // Remove the wave after animation ends
    setTimeout(() => {
      setWaves((prevWaves) =>
        prevWaves.filter((wave) => wave.key !== newWave.key)
      );
    }, 600);

    if (participantData && currentPrice && whirlpool) {
      const depositAmount = new BN(
        participantData.deposit + participantData?.pendingDeposit
      );
      const lstDepositAmount = new BN(participantData.lstDeposits);
      const { whirlpool, price } = await getWhirlpoolData(whirlpoolAddress);
      const swapRatio = 1 / price.toNumber(); // Example calculation, update as needed

      let amountIn;

      const amountInLamports = parseFloat(amount) * LAMPORTS_PER_SOL;
      const participantDeposit =
        Number(participantData?.deposit) +
          Number(participantData?.pendingDeposit) || 0;

      const difference = Math.abs(amountInLamports - participantDeposit);
      const percentageDifference = difference / participantDeposit;

      if (
        participantDeposit > 0 &&
        percentageDifference < 0.002 &&
        participantDeposit < amountInLamports
      ) {
        // If participantDeposit is less than amountInLamports and percentage difference is within 0.0002%
        amountIn = new Decimal(participantDeposit / LAMPORTS_PER_SOL);
      } else if (amountInLamports <= participantDeposit) {
        // If amountInLamports is less than participantDeposit
        amountIn = new Decimal(amount);
      } else {
        // Default case, set amountIn to 0
        amountIn = new Decimal(0);
      }

      console.log(`amountIn: ${amountIn.toString()}`);

      const PriceN = new Decimal(price);
      const amountOut = amountIn.times(PriceN);
      const amountOutQuote = new Decimal(amountOut);

      const quoteOut = await getSwapQuoteOutput(
        whirlpool,
        amountIn,
        slippageTolerance
      );
      const quoteOutLoss = await getSwapQuoteOutputLoss(
        whirlpool,
        amountOutQuote,
        slippageTolerance
      );

      const formattedQuoteOut = decodeSwapQuote(quoteOut);
      const formattedQuoteOutLoss = decodeSwapQuote(quoteOutLoss);

      // const quoteOutLoss = await getSwapQuoteOutputLoss(whirlpool, amountOutQuote, slippageTolerance);

      setSwapQuoteOut(formattedQuoteOut);
      setSwapQuoteOutLoss(formattedQuoteOutLoss);

      // console.log("swapRatio:", swapRatio);
      // console.log("depositRatio:", depositRatio);
      // console.log("lstDepositAmount:", lstDepositAmount);
      // console.log("formattedQuoteOut.estimatedAmountIn:", formattedQuoteOut.estimatedAmountIn);
      // console.log("depositAmount:", depositAmount);
      // console.log("formattedQuoteOut.estimatedAmountOut:", formattedQuoteOut.estimatedAmountOut);

      if (
        // swapRatio >= depositRatio &&
        lstDepositAmount > formattedQuoteOut.estimatedAmountIn &&
        depositAmount >= formattedQuoteOut.estimatedAmountOut

        // swapRatio >= depositRatio &&
        // formattedQuoteOut.estimatedAmountOut.eq(depositAmount)
      ) {
        console.log("met");
        handleWithdraw();
      } else {
        const withdrawAmount = new BN(formattedQuoteOut.estimatedAmountIn).gt(
          lstDepositAmount
        )
          ? lstDepositAmount
          : new BN(formattedQuoteOut.estimatedAmountIn);
        console.log(Number(withdrawAmount.toString()), "withdrawAmount");

        handleWithdrawWithLoss(withdrawAmount);
      }
    }
  };

  const calculateLotteryAPY = (apy, totalTime) => {
    // Assuming the APY is given for a year, convert it to the period of the lottery.
    const secondsInAYear = 365 * 24 * 60 * 60;
    return (apy * totalTime) / secondsInAYear;
  };

  const isAmountValid = amount && parseFloat(amount) > 0;

  const calculateWinningNewChance = () => {
    let parsedAmount = parseFloat(amount);

    // Set parsedAmount to 0 if it's NaN or less than or equal to 0
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      parsedAmount = 0;
    }

    if (
      !lotteryAccountData ||
      Number(lotteryAccountData.totalDeposits) === 0 ||
      (parsedAmount === 0 &&
        (!participantData ||
          Number(participantData?.deposit) +
            Number(participantData?.pendingDeposit) ===
            0))
    ) {
      return "0.00%";
    }

    const totalDeposits =
      Number(lotteryAccountData.totalDeposits) / LAMPORTS_PER_SOL;
    const participantDeposit =
      Number(participantData?.deposit) +
        Number(participantData?.pendingDeposit) || 0;
    const newTotal =
      selectedStake === "DEPOSIT"
        ? totalDeposits + parsedAmount
        : totalDeposits - parsedAmount;
    const newPerson =
      selectedStake === "DEPOSIT"
        ? participantDeposit / LAMPORTS_PER_SOL + parsedAmount
        : participantDeposit / LAMPORTS_PER_SOL - parsedAmount;
    const chance = (newPerson / newTotal) * 100;
    return `${Math.max(chance, 0).toFixed(2)}%`;
  };

  const calculateWinningChance = () => {
    if (!lotteryAccountData || Number(lotteryAccountData.totalDeposits) === 0) {
      return "0.00%";
    }

    const totalDeposits =
      Number(lotteryAccountData.totalDeposits) / LAMPORTS_PER_SOL;
    const participantDeposit =
      Number(participantData?.deposit) +
        Number(participantData?.pendingDeposit) || 0;
    const person = participantDeposit / LAMPORTS_PER_SOL;
    const chance = (person / totalDeposits) * 100;
    return `${chance.toFixed(2)}%`;
  };

  const toggleAdditionalDiv1 = () => {
    setShowAdditionalDiv1(!showAdditionalDiv1);
  };

  const [randomImage, setRandomImage] = useState("");

  const getRandomImageName = () => {
    const images = ["ellipse-1@2x.png", "cat1.png", "cat4.png", "cat6.png"];
    const randomIndex = Math.floor(Math.random() * images.length);
    return images[randomIndex];
  };

  useEffect(() => {
    const randomImageName = getRandomImageName();
    setRandomImage(randomImageName);
  }, []);

  const { subscribeToBalanceChanges } = useUserSOLBalanceStore();

  useEffect(() => {
    if (wallet.publicKey) {
      subscribeToBalanceChanges(wallet.publicKey, connection);
    }
  }, [
    wallet.publicKey,
    connection,
    getUserSOLBalance,
    subscribeToBalanceChanges,
  ]);

  const [currentLottery, setCurrentLottery] = useState("BIG");

  const toggleLottery = (lottery: string) => {
    setCurrentLottery(lottery);
  };

  const handleAmountClick = (type) => {
    let tokenBalance;
    if (type === "HALF" && !isNaN(Number(amount)) && Number(amount) > 0) {
      tokenBalance = Number(amount) / 2;
      tokenBalance = tokenBalance.toFixed(3);
    } else {
      if (selectedStake === "DEPOSIT") {
        tokenBalance =
          type === "HALF" ? (balance - 2 / 100) / 2 : balance - 2 / 100;
        tokenBalance = tokenBalance.toFixed(3);
      } else {
        const participantDeposit = isNaN(
          (Number(participantData?.deposit) +
            Number(participantData?.pendingDeposit)) /
            LAMPORTS_PER_SOL
        )
          ? 0
          : (Number(participantData?.deposit) +
              Number(participantData?.pendingDeposit)) /
            LAMPORTS_PER_SOL;
        tokenBalance =
          type === "HALF" ? participantDeposit / 2 : participantDeposit;
      }
    }
    const maxValue = Math.max(Number(tokenBalance), 0).toFixed(15);
    const displayMax = Math.max(Number(tokenBalance), 0).toFixed(3);

    setAmount(maxValue.toString()); // Update the state, which will update the input value reactively
    setDispleyAmount(displayMax.toString()); // Update the state, which will update the input value reactively
  };

  useEffect(() => {
    const fetchLotteryResults = async () => {
      try {
        const response = await axios.get(
          "https://stakera-socket-1-969a3dd5a532.herokuapp.com/lottery-results"
        );
        const { smallResults, bigResults } = response.data;

        // Set the state with the fetched results
        setSmallLotteryWinners(smallResults);
        setBigLotteryWinners(bigResults);
      } catch (error) {
        console.error("Error fetching lottery results:", error);
      }
    };

    fetchLotteryResults();
  }, []);

  useEffect(() => {
    const fetchUserResults = async () => {
      try {
        if (!publicKey) {
          console.error("Public key is not available");
          return;
        }

        const response = await axios.get(
          `https://stakera-socket-1-969a3dd5a532.herokuapp.com/user-winnings/${publicKey}`
        );
        const userWinn = response.data;

        // Set the state with the fetched results
        setUserWinnings(userWinn);
      } catch (error) {
        console.error("Error fetching lottery results:", error);
      }
    };

    fetchUserResults();
  }, [publicKey]);

  // if (hasAccess === null) {
  //   return (
  //     <div className="flex flex-col justify-center items-center min-h-[calc(100vh-172px)] z-100 bg-layer-1 font-gilroy-semibold">
  //       <div
  //         className="rounded-3xl"
  //         style={{
  //           backgroundImage: "url('/rectangle-17@2x.png')",
  //           backgroundSize: "cover",
  //           backgroundRepeat: "no-repeat",
  //           backgroundPosition: "top",
  //         }}
  //       >
  //         <div className="flex justify-center items-center flex-col p-12">
  //           <p className="text-xl text-white">
  //             Prove that you are a Pophead holder.
  //           </p>

  //           <div className="flex justify-center items-center w-[250px] h-[50px] rounded-lg bg-primary cursor-pointer font-semibold text-center text-lg text-black transition ease-in-out duration-300">
  //             <WalletMultiButtonDynamic
  //               style={{
  //                 width: "100%",
  //                 backgroundColor: "transparent",
  //                 color: "black",
  //               }}
  //               className="mt-0.5 w-[100%]"
  //             >
  //               CONNECT WALLET
  //             </WalletMultiButtonDynamic>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  // if (!hasAccess) {
  //   return (
  //     <div className="flex justify-center items-center min-h-[calc(100vh-172px)] z-100 bg-layer-1 font-gilroy-semibold">
  //       <div
  //         className="rounded-3xl"
  //         style={{
  //           backgroundImage: "url('/rectangle-17@2x.png')",
  //           backgroundSize: "cover",
  //           backgroundRepeat: "no-repeat",
  //           backgroundPosition: "top",
  //         }}
  //       >
  //         <div className="flex justify-center items-center flex-col p-12">
  //           <p className="text-xl text-white">
  //             Access Denied: Your wallet is not on the list.
  //           </p>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className=" overflow-hidden">
      <Head>
        <title>Stakera | Lottery</title>
        <meta name="description" content="PopFi" />
      </Head>

      <div className="flex justify-center items-top min-h-[calc(100vh-172px)] z-100 bg-layer-1 ">
        <div className="w-[95%] max-w-[1700px]">
          <div className="w-full  bg-layer-1 overflow-hidden text-left text-base text-neutral-06 font-gilroy-bold">
            <div
              className="lg:hidden flex rounded-2xl w-full flex lg:flex-row flex-col lg:gap-0 md:gap-4 items-center justify-between p-4 box-border text-13xl  font-gilroy-semibold"
              style={{
                backgroundImage: "url('/frame-2085660298@3x.png')",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "top",
              }}
            >
              <div className="w-full flex flex-col md:items-center items-start justify-between py-4 gap-[8px] md:rounded-2xl [backdrop-filter:blur(10px)] rounded-2xl">
                <div className="px-4 flex flex-row gap-[16px]">
                  <img
                    className="w-16  rounded-[50%] h-16 object-cover"
                    alt=""
                    src={`/${randomImage}`}
                  />
                  <div className="flex flex-col items-start justify-start gap-[4px] ">
                    <div className="self-stretch tracking-[-0.03em] leading-[120.41%]">
                      Welcome {participantData ? "back" : ""}
                    </div>

                    <div className=" text-lg tracking-[-0.03em] leading-[120.41%] font-gilroy-regular inline-block">
                      May the odds be in your favour
                    </div>
                  </div>
                </div>
                <div className="w-full md:w-4/5 py-2 px-4 rounded-2xl flex flex-col items-center justify-center  box-border text-base font-gilroy-medium ">
                  <div className="self-stretch flex md:flex-row flex-col items-start justify-center gap-[32px] ">
                    <div className="w-1/3 flex flex-col items-start justify-start lg:gap-[9px] gap-[4px]">
                      <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] opacity-[0.5]">
                        Your Stake
                      </div>
                      <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-5xl">
                        <span>
                          {isNaN(
                            (Number(participantData?.deposit) +
                              Number(participantData?.pendingDeposit)) /
                              LAMPORTS_PER_SOL
                          )
                            ? 0
                            : (
                                (Number(participantData?.deposit) +
                                  Number(participantData?.pendingDeposit)) /
                                LAMPORTS_PER_SOL
                              ).toFixed(2)}{" "}
                        </span>
                        <span className="text-lg">SOL</span>
                      </div>
                    </div>
                    <div className="w-full md:w-2/3 flex flex-row">
                      <div className="md:w-full w-1/2 flex-1 flex flex-col items-start justify-start lg:gap-[9px] gap-[4px]">
                        <div className=" tracking-[-0.03em] leading-[120.41%] opacity-[0.5]">
                          Your Small Winnings
                        </div>
                        <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-5xl">
                          <span>
                            {userWinnings?.smallWinnings
                              ? isNaN(userWinnings.smallWinnings)
                                ? 0
                                : (
                                    userWinnings.smallWinnings /
                                    LAMPORTS_PER_SOL
                                  ).toFixed(3)
                              : 0}
                          </span>{" "}
                          <span className="text-lg">SOL</span>
                        </div>
                      </div>
                      <div className="md:w-full w-1/2 flex-1 flex flex-col items-start justify-start lg:gap-[9px] gap-[4px]">
                        <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] opacity-[0.5]">
                          Your Big Winnings
                        </div>
                        <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-5xl">
                          <span>
                            {userWinnings?.bigWinnings
                              ? isNaN(userWinnings.bigWinnings)
                                ? 0
                                : (
                                    userWinnings.bigWinnings / LAMPORTS_PER_SOL
                                  ).toFixed(3)
                              : 0}
                          </span>{" "}
                          <span className="text-lg">SOL</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="hidden lg:flex rounded-2xl w-full flex lg:flex-row flex-col lg:gap-0 md:gap-4 items-center justify-between py-2 px-6 box-border text-13xl font-gilroy-semibold"
              style={{
                backgroundImage: "url('/frame-2085660298@3x.png')",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "top",
              }}
            >
              <div className="flex flex-row items-center justify-start py-6 px-2 gap-[16px] md:rounded-2xl  lg:[backdrop-filter:blur(0px)] md:[backdrop-filter:blur(20px)] rounded-2xl">
                <img
                  className="w-16  rounded-[50%] h-16 object-cover"
                  alt=""
                  src={`/${randomImage}`}
                />
                <div className="w-[226px] flex flex-col items-start justify-start gap-[4px] ">
                  <div className="self-stretch tracking-[-0.03em] leading-[120.41%]">
                    Welcome {participantData ? "back" : ""}
                  </div>

                  <div className="w-[255px]  text-lg tracking-[-0.03em] leading-[120.41%] font-gilroy-regular inline-block">
                    May the odds be in your favour
                  </div>
                </div>
              </div>
              <div className="lg:w-[55%] md:w-4/5 py-2 px-8 [backdrop-filter:blur(20px)] rounded-2xl bg-darkslategray-200 h-[90px] flex flex-col items-center justify-center  box-border text-base font-gilroy-medium">
                <div className="self-stretch flex flex-row items-center justify-center gap-[32px] ">
                  <div className="flex-1 flex flex-col items-start justify-start lg:gap-[9px] gap-[4px]">
                    <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] opacity-[0.5]">
                      Your Stake
                    </div>
                    <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-5xl">
                      <span>
                        {isNaN(
                          (Number(participantData?.deposit) +
                            Number(participantData?.pendingDeposit)) /
                            LAMPORTS_PER_SOL
                        )
                          ? 0
                          : (
                              (Number(participantData?.deposit) +
                                Number(participantData?.pendingDeposit)) /
                              LAMPORTS_PER_SOL
                            ).toFixed(2)}{" "}
                      </span>
                      <span className="text-lg">SOL</span>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col items-start justify-start lg:gap-[9px] gap-[4px]">
                    <div className=" tracking-[-0.03em] leading-[120.41%] opacity-[0.5]">
                      Your Small Winnings
                    </div>
                    <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-5xl">
                      <span>
                        {userWinnings?.smallWinnings
                          ? isNaN(userWinnings.smallWinnings)
                            ? 0
                            : (
                                userWinnings.smallWinnings / LAMPORTS_PER_SOL
                              ).toFixed(3)
                          : 0}
                      </span>
                      <span className="text-lg"> SOL</span>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col items-start justify-start lg:gap-[9px] gap-[4px]">
                    <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] opacity-[0.5]">
                      Your Big Winnings
                    </div>
                    <div className="self-stretch  tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-5xl">
                      <span>
                        {userWinnings?.bigWinnings
                          ? isNaN(userWinnings.bigWinnings)
                            ? 0
                            : (
                                userWinnings.bigWinnings / LAMPORTS_PER_SOL
                              ).toFixed(3)
                          : 0}
                      </span>{" "}
                      <span className="text-lg"> SOL</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className=" flex md:flex-row flex-col gap-6 mt-6">
              <div className="flex flex-col gap-6 lg:w-[34%] md:w-[44%]">
                <div className=" flex-1 rounded-2xl bg-bg flex flex-col items-between justify-start py-6 px-5 md:p-6 box-border gap-[16px] text-gray-200 font-gilroy-regular">
                  <div className="self-stretch flex flex-row items-center justify-between text-5xl text-neutral-06 font-gilroy-semibold">
                    <div className="tracking-[-0.03em] leading-[120.41%]">
                      Enter Draw
                    </div>
                    <div className="rounded-981xl bg-mediumspringgreen-100 flex flex-row items-center justify-center py-2 px-3 text-sm text-primary">
                      <div className="w-[100px] leading-[120%] inline-block h-3.5 flex justify-center items-center">
                        Est. APY {result?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="self-stretch rounded-lg bg-gray-100 flex flex-row items-center justify-start p-1 text-neutral-06 font-gilroy-semibold">
                    <div
                      className={`cursor-pointer flex-1 rounded-lg overflow-hidden flex flex-row items-center justify-center p-2 transition-background ${
                        selectedStake === "DEPOSIT"
                          ? "bg-bg text-white"
                          : "bg-gray-100 text-gray-200 hover:text-white transition-all duration-200"
                      }`}
                      onClick={() => setSelectedStake("DEPOSIT")}
                    >
                      Deposit
                    </div>
                    <div
                      className={`cursor-pointer flex-1 rounded-lg flex flex-row items-center justify-center p-2 transition-background ${
                        selectedStake === "WITHDRAW"
                          ? "bg-bg text-white"
                          : "bg-gray-100 text-gray-200 hover:text-white transition-all duration-200"
                      }`}
                      onClick={() => setSelectedStake("WITHDRAW")}
                    >
                      Withdraw
                    </div>
                  </div>
                  <div className="self-stretch flex flex-col items-start justify-start text-sm">
                    <div className="self-stretch rounded-2xl bg-gray-100 flex flex-row items-center justify-between gap-[2] p-4 box-border">
                      <div className="flex flex-col items-start justify-center gap-[8px]">
                        <div className="tracking-[-0.03em] leading-[120.41%]">
                          You are{" "}
                          {selectedStake === "DEPOSIT"
                            ? "depositing"
                            : "withdrawing"}
                        </div>
                        <div className="rounded-lg overflow-hidden flex flex-row items-center justify-center gap-[10.3px] text-lg text-neutral-06 font-gilroy-semibold">
                          <img
                            className="w-10 rounded-981xl h-10 overflow-hidden shrink-0 object-cover"
                            alt=""
                            src="/tokeneth@2x.png"
                          />
                          <div className="tracking-[-0.21px]">SOL</div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-end gap-1">
                        <div className="flex flew-row gap-2">
                          <div className="cursor-pointer rounded-lg bg-mediumspringgreen-50 hover:opacity-50 transition-all duration-200 ease-in-out flex flex-row items-center justify-center py-1 px-2 text-sm text-primary">
                            <div
                              onClick={() => handleAmountClick("HALF")}
                              className="mt-0.5 leading-[120%] inline-block h-3.5 flex justify-center items-center"
                            >
                              HALF
                            </div>
                          </div>
                          <div className="cursor-pointer rounded-lg bg-mediumspringgreen-50 hover:opacity-50 transition-all duration-200 ease-in-out  flex flex-row items-center justify-center py-1 px-2 text-sm text-primary">
                            <div
                              onClick={() => handleAmountClick("MAX")}
                              className="mt-0.5 leading-[120%] inline-block h-3.5 flex justify-center items-center"
                            >
                              MAX
                            </div>
                          </div>
                        </div>
                        <input
                          type="text"
                          className="w-full input-capsule__input text-13xl tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold bg-black"
                          placeholder="0.00"
                          value={displeyAmount}
                          onChange={handleInputChange}
                          min={0.05}
                          step={0.05}
                        />
                      </div>
                    </div>
                  </div>
                  <>
                    {!publicKey ? (
                      <div className="flex justify-center items-center w-full h-[50px] rounded-lg bg-primary cursor-pointer font-semibold text-center text-lg text-black transition ease-in-out duration-300">
                        <WalletMultiButtonDynamic
                          style={{
                            width: "100%",
                            backgroundColor: "transparent",
                            color: "black",
                          }}
                          className="mt-0.5 w-[100%]"
                        >
                          CONNECT WALLET
                        </WalletMultiButtonDynamic>
                      </div>
                    ) : (
                      <>
                        {loading ? (
                          <div className="flex justify-center items-center w-full h-[50px] rounded-lg opacity-[0.5]  bg-primary cursor-not-allowed font-semibold text-center text-lg text-black transition ease-in-out duration-300">
                            <ClipLoader size={20} color={"#000000"} />
                          </div>
                        ) : (
                          <>
                            {isAmountValid && selectedStake === "DEPOSIT" ? (
                              <button
                                className="button-wrapper hover:opacity-70 transition ease-in-out duration-300 cursor-pointer self-stretch rounded-lg bg-primary h-12 flex flex-row items-center justify-center p-2 box-border opacity-1 text-lg text-bg font-gilroy-semibold"
                                onClick={handleDeposit}
                              >
                                <div className="mt-0.5 tracking-[-0.03em] leading-[120.41%]">
                                  Deposit
                                </div>
                                {waves.map((wave) => (
                                  <span
                                    key={wave.key}
                                    className="wave-effect"
                                    style={{
                                      width: wave.size,
                                      height: wave.size,
                                      top: wave.y,
                                      left: wave.x,
                                    }}
                                  />
                                ))}
                              </button>
                            ) : (
                              selectedStake === "DEPOSIT" && (
                                <div className="transition ease-in-out duration-300 self-stretch rounded-lg bg-primary h-12 flex flex-row items-center justify-center p-2 box-border opacity-[0.5] text-lg text-bg font-gilroy-semibold">
                                  <div className="mt-0.5 tracking-[-0.03em] leading-[120.41%]">
                                    Deposit
                                  </div>
                                </div>
                              )
                            )}
                            {isAmountValid && selectedStake === "WITHDRAW" ? (
                              <button
                                className="button-wrapper hover:opacity-70 transition ease-in-out duration-300 cursor-pointer self-stretch rounded-lg bg-primary h-12 flex flex-row items-center justify-center p-2 box-border opacity-1 text-lg text-bg font-gilroy-semibold"
                                onClick={handleWithdrawDecision}
                                // onClick={handleTeamWithdraw}
                              >
                                <div className="mt-0.5 tracking-[-0.03em] leading-[120.41%]">
                                  Withdraw
                                </div>
                                {waves.map((wave) => (
                                  <span
                                    key={wave.key}
                                    className="wave-effect"
                                    style={{
                                      width: wave.size,
                                      height: wave.size,
                                      top: wave.y,
                                      left: wave.x,
                                    }}
                                  />
                                ))}
                              </button>
                            ) : (
                              selectedStake === "WITHDRAW" && (
                                <div className="transition ease-in-out duration-300 self-stretch rounded-lg bg-primary h-12 flex flex-row items-center justify-center p-2 box-border opacity-[0.5] text-lg text-bg font-gilroy-semibold">
                                  <div className="mt-0.5 tracking-[-0.03em] leading-[120.41%]">
                                    Withdraw
                                  </div>
                                </div>
                              )
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                  <div className="self-stretch flex flex-row items-center justify-between">
                    <div className="tracking-[-0.03em] leading-[120.41%]">
                      Settings
                    </div>
                    <div className="rounded-981xl flex flex-row items-center justify-start py-0.5 px-0 gap-[4px]">
                      <img
                        className="cursor-pointer w-full h-full"
                        onClick={toggleAdditionalDiv1}
                        alt="Candle Icon"
                        src="/vuesaxboldcandle2.svg"
                      />
                    </div>
                  </div>
                  <div
                    className={`w-full flex flex-row items-center justify-between gap-[8px]  ${showAdditionalDiv1 ? "" : "hidden"}`}
                  >
                    <div className="tracking-[-0.03em] leading-[120.41%]">
                      Slippage
                    </div>
                    <div className="self-stretch flex flex-col items-start justify-start">
                      <div className="self-stretch flex flex-row items-start justify-start gap-[8px]">
                        <button
                          onClick={() => handleButtonClick(1)}
                          className={`cursor-pointer w-1/3 rounded h-6 flex flex-col items-center justify-center box-border transition-all duration-200 ease-in-out ${
                            activeButton === 1
                              ? "bg-primary"
                              : "bg-[#ffffff12] hover:bg-[#ffffff36] text-gray-200"
                          }`}
                        >
                          0.1%
                        </button>
                        <button
                          onClick={() => handleButtonClick(2)}
                          className={`cursor-pointer w-1/3 rounded h-6 flex flex-col items-center justify-center box-border transition-all duration-200 ease-in-out ${
                            activeButton === 2
                              ? "bg-primary"
                              : "bg-[#ffffff12] hover:bg-[#ffffff36] text-gray-200"
                          }`}
                        >
                          0.3%
                        </button>
                        <button
                          onClick={() => handleButtonClick(3)}
                          className={`cursor-pointer w-1/3 rounded h-6 flex flex-col items-center justify-center box-border transition-all duration-200 ease-in-out ${
                            activeButton === 3
                              ? "bg-primary"
                              : "bg-[#ffffff12] hover:bg-[#ffffff36] text-gray-200"
                          }`}
                        >
                          0.5%
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-full flex flex-row items-end justify-between gap-[8px] ${showAdditionalDiv1 ? "" : "hidden"}`}
                  >
                    <div className="tracking-[-0.03em] leading-[120.41%]">
                      Depeg Protection
                    </div>
                    <div className="self-stretch flex flex-col items-start justify-start">
                      <div className="self-stretch flex flex-row items-start justify-start gap-[8px]">
                        <label className="toggle-switch-bigger">
                          <input
                            type="checkbox"
                            checked={depegProtectionState}
                            onChange={handleToggle}
                            className="hidden"
                          />
                          <div
                            className={`slider-bigger ${depegProtectionState ? "active" : ""}`}
                          ></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="self-stretch flex flex-row items-center justify-between">
                    <div className="w-[74px] tracking-[-0.03em] leading-[100%] flex items-end h-5 shrink-0">
                      Balance
                    </div>
                    <div className="flex flex-row items-center justify-start gap-[8px]">
                      <div className="tracking-[-0.03em] leading-[120.41%] inline-block h-[18px] shrink-0">
                        {balance.toFixed(1)} SOL
                      </div>
                      <img
                        className="w-4 h-4"
                        alt=""
                        src="/vuesaxboldwallet2.svg"
                      />
                    </div>
                  </div>

                  <div className="self-stretch h-6 flex flex-row items-center justify-between">
                    <div className="tracking-[-0.03em] leading-[120.41%]">
                      Winning Chance
                    </div>
                    <div className="rounded-981xl flex flex-row items-center justify-start py-0.5 px-0 gap-[4px]">
                      <div className="tracking-[-0.03em] leading-[120.41%] inline-block h-[18px] shrink-0">
                        {calculateWinningNewChance()}
                      </div>
                      <img
                        className="w-4 h-4"
                        alt=""
                        src="/vuesaxboldmedalstar.svg"
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="md:flex hidden max-h-[200px] flex-1 flex flex-col p-6 gap-3 rounded-2xl  overflow-hidden"
                  style={{
                    backgroundImage: "url('/frame-2085660304@3x.png')",
                    backgroundSize: "cover",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "top",
                  }}
                >
                  <div className="text-xl tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold">
                    Refer to increase your winnings
                  </div>
                  <span className="text-mini tracking-[-0.03em] leading-[130%] font-gilroy-regular text-gray-300 inline-block">
                    For each friend you refer you will increase your winnings
                  </span>
                  <div className="font-gilroy-semibold flex xl:flex-row flex-col gap-4">
                    <div className="h-9 [backdrop-filter:blur(4px)] rounded-lg bg-gray-500 w-full flex flex-row items-center justify-between pl-2 box-border gap-[8px]">
                      <div className="z-[0]">Soon™</div>
                      <div className="h-full w-9 justify-end items-end rounded-tl-none rounded-tr-lg rounded-br-lg rounded-bl-none bg-gray-400 flex flex-row items-center justify-center z-[1]">
                        <img
                          className="w-6 h-6"
                          alt=""
                          src="/vuesaxbulkcopy.svg"
                        />
                      </div>
                    </div>
                    <div className="flex flex-row items-center justify-start gap-[32px]">
                      <div className="flex flex-row items-center justify-start gap-[9px]">
                        <img
                          className="w-6 h-6 opacity-[0.5]"
                          alt=""
                          src="/vuesaxbolddollarcircle.svg"
                        />
                        <div className="tracking-[-0.03em] leading-[130%]">
                          0.0 SOL
                        </div>
                      </div>
                      <div className="flex flex-row items-center justify-start gap-[6px]">
                        <img
                          className="w-6 h-6 opacity-[0.5]"
                          alt=""
                          src="/vuesaxboldprofile2user.svg"
                        />
                        <div className="tracking-[-0.03em] leading-[130%]">
                          0
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-[66%] md:w-[56%] flex flex-col lg:flex-row lg:gap-6">
                <div
                  className={` flex-1 rounded-2xl bg-bg flex flex-col items-start justify-start p-5 md:p-6 gap-[24px] text-neutral-06 ${currentLottery === "SMALL" ? "block" : "hidden"} lg:flex`}
                >
                  <div className="cursor-pointer lg:hidden flex font-gilroy-semibold self-stretch flex flex-row items-start justify-start text-lg text-primary ">
                    <div
                      onClick={() => toggleLottery("SMALL")}
                      className={` flex-1   h-10 flex flex-row items-center justify-center  px-2 transition-all duration-200 ease-in-out  ${
                        currentLottery === "SMALL"
                          ? " flex-1 h-10 flex flex-row items-center justify-center  px-2 border-b-[2px] border-solid border-short"
                          : " text-[#ffffff60] border-b-[2px] border-solid border-[#ffffff12]"
                      }`}
                    >
                      Small Lottery
                    </div>
                    <div
                      onClick={() => toggleLottery("BIG")}
                      className={`cursor-pointer flex-1   h-10 flex flex-row items-center justify-center px-2 transition-all duration-200 ease-in-out  ${
                        currentLottery === "BIG"
                          ? " flex-1 h-10 flex flex-row items-center justify-center  px-2 border-b-[2px] border-solid border-short"
                          : " text-[#ffffff60] border-b-[2px] border-solid border-[#ffffff12]"
                      }`}
                    >
                      <div
                        className={`flex justify-center items-center h-full w-full rounded-lg ${
                          currentLottery === "BIG" ? "" : ""
                        }`}
                      >
                        Big Lottery
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-black self-stretch rounded-2xl flex flex-col items-start justify-center p-6 gap-[24px]"
                    style={smallLotteryBgStyle}
                  >
                    <div className="self-stretch flex flex-row items-start justify-between z-[1]">
                      <div className="tracking-[-0.03em] leading-[120.41%]">
                        Small Lottery
                      </div>
                      <div className="tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold">
                        {remainingTimeSmallLottery !== null
                          ? formatRemainingTime(remainingTimeSmallLottery)
                          : "Loading..."}
                      </div>
                    </div>
                    <div className="flex flex-col items-start justify-start gap-[8px] z-[2] text-35xl font-gilroy-bold">
                      <div className="self-stretch tracking-[-0.03em] leading-[120.41%] inline-block h-[47px] shrink-0">
                        <span>
                          {smallLotteryYield !== null
                            ? (
                                smallLotteryYield.toFixed(0) / LAMPORTS_PER_SOL
                              ).toFixed(3)
                            : "0"}
                        </span>{" "}
                        {/* Small Lottery APY */}{" "}
                        <span className="text-13xl">SOL</span>
                      </div>
                      <div className="self-stretch text-mid tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold">
                        {calculateWinningChance()} Chance
                      </div>
                    </div>
                  </div>
                  <div className="self-stretch flex flex-col items-start justify-start gap-[16px] text-3xl text-neutral-06 font-gilroy-bold">
                    <div className="self-stretch tracking-[-0.03em] leading-[120.41%]">
                      Previous Winners
                    </div>
                    <div className="self-stretch flex flex-col items-start justify-start gap-[24px] text-sm text-gray-200 font-gilroy-medium">
                      {smallLotteryWinners
                        .slice(0, 6) // Take only the latest 6 entries
                        .map((winner, index) => (
                          <div
                            key={index}
                            className="self-stretch flex flex-row items-start justify-start gap-[4px]"
                          >
                            <div className="flex-1 flex flex-col items-start justify-start gap-[4px]">
                              <div className="self-stretch tracking-[-0.03em] leading-[120.41%]">
                                {new Date(
                                  winner.timestamp
                                ).toLocaleDateString()}
                              </div>
                              <div className="self-stretch text-mini tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-neutral-06">
                                {formatPublicKey(winner.winner)} won{" "}
                                {(
                                  winner.yieldAmount / LAMPORTS_PER_SOL
                                ).toFixed(2)}{" "}
                                SOL with{" "}
                                {Number(winner.winningChance).toFixed(1)}%
                                chance
                              </div>
                            </div>
                            <a
                              href={`https://solscan.io/tx/${winner.transactionSignature}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              <img
                                className="w-4 h-4"
                                alt=""
                                src="/vuesaxlinearlink.svg"
                              />
                            </a>{" "}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
                <div
                  className={` flex-1 rounded-2xl bg-bg flex flex-col items-start justify-start p-5 md:p-6 gap-[24px] text-neutral-06 ${currentLottery === "BIG" ? "block" : "hidden"} lg:flex`}
                >
                  <div className="cursor-pointer lg:hidden flex font-gilroy-semibold self-stretch flex flex-row items-start justify-start text-lg text-primary ">
                    <div
                      onClick={() => toggleLottery("SMALL")}
                      className={`flex-1   h-10 flex flex-row items-center justify-center  px-2 transition-all duration-200 ease-in-out  ${
                        currentLottery === "SMALL"
                          ? "flex-1 h-10 flex flex-row items-center justify-center  px-2 border-b-[2px] border-solid border-short"
                          : "text-[#ffffff60] border-b-[2px] border-solid border-[#ffffff12]"
                      }`}
                    >
                      Small Lottery
                    </div>
                    <div
                      onClick={() => toggleLottery("BIG")}
                      className={`flex-1   h-10 flex flex-row items-center justify-center px-2 transition-all duration-200 ease-in-out  ${
                        currentLottery === "BIG"
                          ? "flex-1 h-10 flex flex-row items-center justify-center  px-2 border-b-[2px] border-solid border-short"
                          : "text-[#ffffff60] border-b-[2px] border-solid border-[#ffffff12]"
                      }`}
                    >
                      <div
                        className={`flex justify-center items-center h-full w-full rounded-lg ${
                          currentLottery === "BIG" ? "" : ""
                        }`}
                      >
                        Big Lottery
                      </div>
                    </div>
                  </div>
                  <div
                    className="self-stretch rounded-2xl flex flex-col items-start justify-center p-6 gap-[24px]"
                    style={bigLotteryBgStyle}
                  >
                    <div className="self-stretch flex flex-row items-start justify-between z-[1]">
                      <div className="tracking-[-0.03em] leading-[120.41%]">
                        Big Lottery
                      </div>
                      <div className="tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold">
                        {remainingTimeBigLottery !== null
                          ? formatRemainingTime(remainingTimeBigLottery)
                          : "Loading..."}
                      </div>
                    </div>
                    <div className="flex flex-col items-start justify-start gap-[8px] z-[2] text-35xl font-gilroy-bold">
                      <div className="self-stretch tracking-[-0.03em] leading-[120.41%] inline-block h-[47px] shrink-0">
                        <span>
                          {bigLotteryYield !== null
                            ? (
                                bigLotteryYield.toFixed(0) / LAMPORTS_PER_SOL
                              ).toFixed(3)
                            : "0"}
                        </span>{" "}
                        {/* Small Lottery APY */}{" "}
                        <span className="text-13xl">SOL</span>
                      </div>
                      <div className="self-stretch text-mid tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold">
                        {calculateWinningChance()} Chance
                      </div>
                    </div>
                  </div>
                  <div className="self-stretch flex flex-col items-start justify-start gap-[16px] text-3xl font-gilroy-bold">
                    <div className="self-stretch tracking-[-0.03em] leading-[120.41%]">
                      Previous Winners
                    </div>
                    <div className="self-stretch flex flex-col items-start justify-start gap-[24px] text-sm text-gray-200 font-gilroy-medium">
                      {bigLotteryWinners

                        .slice(0, 6) // Take only the latest 6 entries
                        .map((winner, index) => (
                          <div
                            key={index}
                            className="self-stretch flex flex-row items-start justify-start gap-[4px]"
                          >
                            <div className="flex-1 flex flex-col items-start justify-start gap-[4px]">
                              <div className="self-stretch tracking-[-0.03em] leading-[120.41%]">
                                {new Date(
                                  winner.timestamp
                                ).toLocaleDateString()}
                              </div>
                              <div className="self-stretch text-mini tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-neutral-06">
                                {formatPublicKey(winner.winner)} won{" "}
                                {(
                                  winner.yieldAmount / LAMPORTS_PER_SOL
                                ).toFixed(2)}{" "}
                                SOL with{" "}
                                {Number(winner.winningChance).toFixed(1)}%
                                chance
                              </div>
                            </div>
                            <a
                              href={`https://solscan.io/tx/${winner.transactionSignature}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              <img
                                className="w-4 h-4"
                                alt=""
                                src="/vuesaxlinearlink.svg"
                              />
                            </a>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="md:hidden max-h-[200px] flex-1 flex flex-col p-5 gap-3 rounded-2xl  overflow-hidden"
                style={{
                  backgroundImage: "url('/frame-2085660304@3x.png')",
                  backgroundSize: "cover",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "top",
                }}
              >
                <div className="text-xl tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold">
                  Refer to increase your winnings
                </div>
                <span className="text-mini tracking-[-0.03em] leading-[130%] font-gilroy-regular text-gray-300 inline-block">
                  For each friend you refer you will increase your winnings
                </span>
                <div className="font-gilroy-semibold flex xk:flex-row flex-col gap-4">
                  <div className=" [backdrop-filter:blur(4px)] rounded-lg bg-gray-500 w-[213px] flex flex-row items-center justify-start p-2 box-border gap-[8px]">
                    <div className="tracking-[-0.03em] leading-[130%] z-[0]">
                      Soon™
                    </div>
                    <div className="absolute w-9 !m-[0] top-[0px] right-[0px] rounded-tl-none rounded-tr-lg rounded-br-lg rounded-bl-none bg-gray-400 h-[37px] flex flex-row items-center justify-center z-[1]">
                      <img
                        className="w-6 h-6"
                        alt=""
                        src="/vuesaxbulkcopy.svg"
                      />
                    </div>
                  </div>
                  <div className="flex flex-row items-center justify-start gap-[32px]">
                    <div className="flex flex-row items-center justify-start gap-[9px]">
                      <img
                        className="w-6 h-6 opacity-[0.5]"
                        alt=""
                        src="/vuesaxbolddollarcircle.svg"
                      />
                      <div className="tracking-[-0.03em] leading-[130%]">
                        0.0 SOL
                      </div>
                    </div>
                    <div className="flex flex-row items-center justify-start gap-[6px]">
                      <img
                        className="w-6 h-6 opacity-[0.5]"
                        alt=""
                        src="/vuesaxboldprofile2user.svg"
                      />
                      <div className="tracking-[-0.03em] leading-[130%]">0</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lottery;
