import { ProgramTestContext } from "solana-bankrun";
import { convertToByteArray, generateKpAndFund, startTest } from "./bankrun-utils/common";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MIN_LP_AMOUNT,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  createToken,
  mintSplTokenTo,
  createDynamicConfigIx,
  CreateDynamicConfigParams,
  InitializePoolWithCustomizeConfigParams,
  initializePoolWithCustomizeConfig,
  getPool,
} from "./bankrun-utils";
import BN from "bn.js";
import { expect } from "chai";

describe("Dynamic config test", () => {
  let context: ProgramTestContext;
  let admin: Keypair;
  let creator: Keypair;
  let config: PublicKey;
  let tokenAMint: PublicKey;
  let tokenBMint: PublicKey;
  let liquidity: BN;
  let sqrtPrice: BN;
  const configId = Math.floor(Math.random() * 1000);

  beforeEach(async () => {
    const root = Keypair.generate();
    context = await startTest(root);
    creator = await generateKpAndFund(context.banksClient, context.payer);
    admin = await generateKpAndFund(context.banksClient, context.payer);

    tokenAMint = await createToken(
      context.banksClient,
      context.payer,
      context.payer.publicKey
    );
    tokenBMint = await createToken(
      context.banksClient,
      context.payer,
      context.payer.publicKey
    );

    await mintSplTokenTo(
      context.banksClient,
      context.payer,
      tokenAMint,
      context.payer,
      creator.publicKey
    );

    await mintSplTokenTo(
      context.banksClient,
      context.payer,
      tokenBMint,
      context.payer,
      creator.publicKey
    );
    // create dynamic config
    const createDynamicConfigParams: CreateDynamicConfigParams = {
      poolCreatorAuthority: creator.publicKey,
    };

    config = await createDynamicConfigIx(
      context.banksClient,
      admin,
      new BN(configId),
      createDynamicConfigParams
    );
  });

  it("create pool with dynamic config", async () => {
    const params: InitializePoolWithCustomizeConfigParams = {
      payer: creator,
      creator: creator.publicKey,
      poolCreatorAuthority: creator,
      customizeConfigAddress: config,
      tokenAMint,
      tokenBMint,
      liquidity: MIN_LP_AMOUNT,
      sqrtPrice: MIN_SQRT_PRICE,
      sqrtMinPrice: MIN_SQRT_PRICE,
      sqrtMaxPrice: MAX_SQRT_PRICE,
      hasAlphaVault: false,
      activationPoint: null,
      poolFees: {
        baseFee: {
          cliffFeeNumerator: new BN(2_500_000),
          firstFactor: 0,
          secondFactor: convertToByteArray(new BN(0)),
          thirdFactor: new BN(0),
          baseFeeMode: 0,
        },
        padding: [],
        dynamicFee: null,
      },
      activationType: 0,
      collectFeeMode: 0,
    };

    const { pool } = await initializePoolWithCustomizeConfig(context.banksClient, params);
    const poolState = await getPool(context.banksClient, pool);
    expect(poolState.version).eq(0);
  });
});
