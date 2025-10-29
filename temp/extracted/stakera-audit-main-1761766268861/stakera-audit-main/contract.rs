use anchor_lang::prelude::*;
use anchor_lang::solana_program::entrypoint::ProgramResult;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::get_feed_id_from_hex;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use solana_program::program::invoke_signed;
use solana_program::system_instruction;
use std::str::FromStr;
use switchboard_on_demand::accounts::RandomnessAccountData;
use whirlpool_cpi::{self, state::*, util::unpack::unpack_tick_array};

use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};

declare_id!("StkraNY8rELLLoDHmVg8Di8DKTLbE8yAWZqRR9w413n");

const HOUSE_WALLET_ADDRESS: &str = "HME9CUNgcsVZti5x1MdoBeUuo1hkGnuKMwP4xuJHQFtQ";
const PDA_HOUSE_WALLET_ADDRESS: &str = "FnxstpbQKMYW3Jw7SY5outhEiHGDkg7GUpoCVt9nVuHJ";
const WHIRLPOOL_ADDRESS: &str = "DxD41srN8Xk9QfYjdNXF9tTnP6qQxeF2bZF8s1eN62Pe";
const SIGNER_ADDRESS: &str = "CwG9un39cYY1UU3ZX31MDdCUwWHPjzzvQGSr8cucLoiY";

const LOTTERY_ADDY: &str = "9aFmbWZuMbCQzMyNqsTB4umen9mpnqL6Z6a4ypis3XzW";

const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
const INF_MINT: &str = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
const POOL_STATE: &str = "AYhux5gJzCoeoc1PoJ1VxwPDe22RwcvpHviLDD1oCGvW";

const ORACLE_SOL_ADDY: &str = "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE";
const ORACLE_INF_ADDY: &str = "Ceg5oePJv1a6RR541qKeQaTepvERA3i8SvyueX9tT8Sq";

const ORACLE_SOL: &str = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const ORACLE_INF: &str = "0xf51570985c642c49c2d6e50156390fdba80bb6d5f7fa389d2f012ced4f7d208f";
const SCALE: u64 = 100000000;
const SCALE_SQRT: u128 = 10000000;

#[program]
pub mod lottery {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let lottery_account = &mut ctx.accounts.lottery_account;
        let house_acc = &mut ctx.accounts.house_acc;
        let pda_house_acc = &mut ctx.accounts.pda_house_acc;
        let system_address = &mut ctx.accounts.system_program;

        if lottery_account.is_initialized {
            return err!(CustomError::InitAccount);
        }

        // Calculate the PDA address and bump seed for the PDA house wallet
        let (pda_house_wallet_address, _bump_seed) =
            Pubkey::find_program_address(&[&b"LotteryWallet"[..]], ctx.program_id);

        if pda_house_acc.key != &pda_house_wallet_address {
            return err!(CustomError::InvalidArguments);
        }

        lottery_account.is_initialized = true;
        lottery_account.total_deposits = 0;
        lottery_account.lst_total_deposits = 0;
        lottery_account.participants = Vec::new();
        lottery_account.big_lottery_happened = true;
        lottery_account.small_lottery_happened = true;
        lottery_account.small_lottery_to_big = 0;

        transfer(&house_acc, &pda_house_acc, &system_address, 5000)?;

        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
        _slippage: u64,
        depeg_protection: bool,
    ) -> Result<()> {
        let user = &mut ctx.accounts.user;
        let pda_house_acc = &ctx.accounts.pda_house_acc;
        let system_address = &mut ctx.accounts.system_program;

        let lottery_account = &mut ctx.accounts.lottery_account;

        if !(amount_specified_is_input && a_to_b) {
            return err!(CustomError::InvalidArguments);
        }

        if amount == 0 {
            return err!(CustomError::InvalidArguments);
        }

        // Calculate the PDA address and bump seed for the PDA house wallet
        let (_pda_house_wallet_address, bump_seed) =
            Pubkey::find_program_address(&[&b"LotteryWallet"[..]], ctx.program_id);

        let seeds = &[&b"LotteryWallet"[..], &[bump_seed]];

        // Transfer user SOL to PDA account
        transfer(&user, &pda_house_acc, &system_address, amount)?;

        // Transfer SOL to WSOL within the PDA
        let transfer_sol_to_ata = system_instruction::transfer(
            &pda_house_acc.key(),
            &ctx.accounts.token_owner_account_a.key(),
            amount,
        );
        invoke_signed(
            &transfer_sol_to_ata,
            &[
                pda_house_acc.to_account_info(),
                ctx.accounts.token_owner_account_a.to_account_info(),
                system_address.to_account_info(),
            ],
            &[seeds],
        )?;

        let sync_balance_ix = spl_token::instruction::sync_native(
            &spl_token::ID,
            &ctx.accounts.token_owner_account_a.key(),
        )?;
        invoke_signed(
            &sync_balance_ix,
            &[
                ctx.accounts.token_owner_account_a.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
            &[seeds],
        )?;

        let initial_balance_a = ctx.accounts.token_owner_account_a.amount;
        let initial_balance_b = ctx.accounts.token_owner_account_b.amount;

        // Whirlpool swap logic
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let ta0 = unpack_tick_array(&ctx.accounts.tick_array_0)?;
        msg!("start_tick_index: {}", ta0.start_tick_index);

        let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap {
            whirlpool: ctx.accounts.whirlpool.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_authority: ctx.accounts.pda_house_acc.to_account_info(),
            token_owner_account_a: ctx.accounts.token_owner_account_a.to_account_info(),
            token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
            token_owner_account_b: ctx.accounts.token_owner_account_b.to_account_info(),
            token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
            tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
            tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
            tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
            oracle: ctx.accounts.oracle.to_account_info(),
        };

        let seedss: &[&[u8]] = &[&b"LotteryWallet"[..], &[bump_seed]];
        let signer_seeds: &[&[&[u8]]] = &[&seedss];

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);
        let result = whirlpool_cpi::cpi::swap(
            cpi_ctx,
            amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );

        match result {
            Ok(_) => {
                msg!("Whirlpool swap successful");

                ctx.accounts.token_owner_account_a.reload()?;
                ctx.accounts.token_owner_account_b.reload()?;

                let final_balance_a = ctx.accounts.token_owner_account_a.amount;
                let final_balance_b = ctx.accounts.token_owner_account_b.amount;

                let received_amount_a = final_balance_a
                    .checked_sub(initial_balance_a)
                    .ok_or(CustomError::ArithmeticError)?;

                let received_amount_b = final_balance_b
                    .checked_sub(initial_balance_b)
                    .ok_or(CustomError::ArithmeticError)?;

                let deposit_sub_orca_fee = amount
                    .checked_mul(9999)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_mul(9999)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                // Log the received amounts
                msg!("Swapped SOL: {}", amount);
                msg!("Received SOL: {}", received_amount_a);

                msg!("Deposited INF: {}", received_amount_b);

                // Oracle Check
                let sol_price = fetch_price(&ctx.accounts.sol_oracle_account, true, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sol Price: {}", sol_price);

                let inf_price = fetch_price(&ctx.accounts.inf_oracle_account, false, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Inf Price: {}", inf_price);

                let ratio = inf_price
                    .checked_mul(SCALE as i64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(sol_price)
                    .ok_or(CustomError::ArithmeticError)?;

                let swap_ratio = deposit_sub_orca_fee
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                let adjustment_value = if depeg_protection { 20 } else { 50 };
                msg!("Depeg Protection: {}", adjustment_value);

                let upper_bound = ratio
                    .checked_mul(10000 + adjustment_value)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                // Deserialize pool_state
                let pool_state_data: &[u8] = &ctx.accounts.pool_state.try_borrow_data()?;
                let pool_state: PoolState = PoolState::try_from_slice(pool_state_data)
                    .map_err(|_| CustomError::DeserializationError)?;

                let fair_value = (pool_state.total_sol_value as u128)
                    .checked_mul(SCALE as u128)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(ctx.accounts.inf_mint.supply as u128)
                    .ok_or(CustomError::ArithmeticError)? as u64;

                let higher_bound_peg = fair_value
                    .checked_mul((10000 + adjustment_value) as u64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Swap Ratio: {}", swap_ratio);
                msg!("Pyth Ratio: {}", ratio);
                msg!("Fair Ratio: {}", fair_value);
                msg!("Upper Bound Peg: {}", upper_bound);

                // Kontrola, zda swap_ratio nepřesahuje horní hranici
                if swap_ratio <= higher_bound_peg {
                    msg!("Pairs are within acceptable peg Spot vs Fair Price");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Spot vs Fair Price");
                    return Err(CustomError::DeppegedPair.into());
                }

                // Kontrola, zda swap_ratio nepřesahuje horní hranici
                if swap_ratio <= upper_bound as u64 {
                    msg!("Pairs are within acceptable peg Spot vs Pyth");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Spot vs Pyth - Too Expensive");
                    return Err(CustomError::DeppegedPair.into());
                }

                // Najděte účastníka v účtu loterie nebo jej přidejte

                if let Some(participant) = lottery_account
                    .participants
                    .iter_mut()
                    .find(|p| p.pubkey == user.key())
                {
                    participant.pending_deposit = participant
                        .pending_deposit
                        .checked_add(deposit_sub_orca_fee)
                        .ok_or(CustomError::ArithmeticError)?;

                    // max deposits
                    let current_deposit = participant
                        .pending_deposit
                        .checked_add(participant.deposit)
                        .ok_or(CustomError::ArithmeticError)?;

                    // 10 sol
                    let max_deposit = 10000000000;

                    if current_deposit > max_deposit {
                        return err!(CustomError::MaxDepositReached);
                    }

                    participant.lst_deposits = participant
                        .lst_deposits
                        .checked_add(received_amount_b)
                        .ok_or(CustomError::ArithmeticError)?;
                } else {
                    lottery_account.participants.push(Participant {
                        pubkey: *user.key,
                        deposit: 0,
                        lst_deposits: received_amount_b,
                        pending_deposit: deposit_sub_orca_fee,
                    });

                    let current_deposit = amount;

                    // 10 sol
                    let max_deposit = 10000000000;

                    if current_deposit > max_deposit {
                        return err!(CustomError::MaxDepositReached);
                    }
                }

                lottery_account.total_deposits = lottery_account
                    .total_deposits
                    .checked_add(deposit_sub_orca_fee)
                    .ok_or(CustomError::ArithmeticError)?;
                lottery_account.lst_total_deposits = lottery_account
                    .lst_total_deposits
                    .checked_add(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;
            }

            Err(err) => {
                msg!("Whirlpool swap failed: {:?}", err);
                return Err(err);
            }
        }

        // Close WSOL account and transfer SOL to user
        let close_wsol_ix = spl_token::instruction::close_account(
            &spl_token::ID,
            &ctx.accounts.token_owner_account_a.key(),
            &user.key(),
            &pda_house_acc.key(),
            &[],
        )?;
        invoke_signed(
            &close_wsol_ix,
            &[
                ctx.accounts.token_owner_account_a.to_account_info(),
                user.to_account_info(),
                pda_house_acc.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
            &[seeds],
        )?;

        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
        _slippage: u64,
        depeg_protection: bool,
    ) -> Result<()> {
        // let system_address = &mut ctx.accounts.system_program;
        let user = &mut ctx.accounts.user;
        let lottery_account = &mut ctx.accounts.lottery_account;
        let pda_house_acc = &ctx.accounts.pda_house_acc;

        if amount_specified_is_input && a_to_b {
            return err!(CustomError::InvalidArguments);
        }

        // Najděte účastníka v účtu loterie

        // Find participant in the lottery account
        let participant = lottery_account
            .participants
            .iter_mut()
            .find(|p| p.pubkey == user.key())
            .ok_or(CustomError::InsufficientBalance)?;

        let total_withdrawable = participant
            .pending_deposit
            .checked_add(participant.deposit)
            .ok_or(CustomError::ArithmeticError)?;

        require!(
            total_withdrawable >= amount,
            CustomError::InsufficientBalance
        );

        let (pda_house_wallet_address, bump_seed) =
            Pubkey::find_program_address(&[&b"LotteryWallet"[..]], ctx.program_id);

        if pda_house_acc.key != &pda_house_wallet_address {
            return err!(CustomError::InvalidAccounts);
        }

        let seeds = &[&b"LotteryWallet"[..], &[bump_seed]];

        let initial_balance_a = ctx.accounts.token_owner_account_a.amount;
        let initial_balance_b = ctx.accounts.token_owner_account_b.amount;

        msg!("Initial Balance amount A: {}", initial_balance_a);
        msg!("Initial Balance amount B: {}", initial_balance_b);

        // Whirlpool swap logic
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let ta0 = unpack_tick_array(&ctx.accounts.tick_array_0)?;
        msg!("start_tick_index: {}", ta0.start_tick_index);

        let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap {
            whirlpool: ctx.accounts.whirlpool.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_authority: ctx.accounts.pda_house_acc.to_account_info(),
            token_owner_account_a: ctx.accounts.token_owner_account_a.to_account_info(),
            token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
            token_owner_account_b: ctx.accounts.token_owner_account_b.to_account_info(),
            token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
            tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
            tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
            tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
            oracle: ctx.accounts.oracle.to_account_info(),
        };

        let seedss: &[&[u8]] = &[&b"LotteryWallet"[..], &[bump_seed]];
        let signer_seeds: &[&[&[u8]]] = &[&seedss];

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);
        let result = whirlpool_cpi::cpi::swap(
            cpi_ctx,
            amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );

        match result {
            Ok(_) => {
                msg!("Whirlpool swap successful");

                ctx.accounts.token_owner_account_a.reload()?;
                ctx.accounts.token_owner_account_b.reload()?;

                // Fetch final balances
                let final_balance_a = ctx.accounts.token_owner_account_a.amount;
                let final_balance_b = ctx.accounts.token_owner_account_b.amount;
                // Log the received amounts
                msg!("Final Balance A: {}", final_balance_a);
                msg!("Final Balance B: {}", final_balance_b);

                // Calculate received amounts
                let received_amount_a = final_balance_a
                    .checked_sub(initial_balance_a)
                    .ok_or(CustomError::ArithmeticError)?;
                let received_amount_b = initial_balance_b
                    .checked_sub(final_balance_b)
                    .ok_or(CustomError::ArithmeticError)?;

                // Log the received amounts
                msg!("Received SOL token A: {}", received_amount_a);
                msg!("Withdrew INF: {}", received_amount_b);

                // Oracle Check
                let sol_price = fetch_price(&ctx.accounts.sol_oracle_account, true, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sol Price: {}", sol_price);

                let inf_price = fetch_price(&ctx.accounts.inf_oracle_account, false, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Inf Price: {}", inf_price);

                let ratio = inf_price
                    .checked_mul(SCALE as i64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(sol_price)
                    .ok_or(CustomError::ArithmeticError)?;

                let swap_ratio = received_amount_a
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                let adjustment_value = if depeg_protection { 20 } else { 50 };
                msg!("Depeg Protection: {}", adjustment_value);

                let lower_bound = ratio
                    .checked_mul(10000 - adjustment_value)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                // Deserialize pool_state
                let pool_state_data: &[u8] = &ctx.accounts.pool_state.try_borrow_data()?;
                let pool_state: PoolState = PoolState::try_from_slice(pool_state_data)
                    .map_err(|_| CustomError::DeserializationError)?;

                let fair_value = (pool_state.total_sol_value as u128)
                    .checked_mul(SCALE as u128)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(ctx.accounts.inf_mint.supply as u128)
                    .ok_or(CustomError::ArithmeticError)? as u64;

                let lower_bound_peg = fair_value
                    .checked_mul((10000 - adjustment_value) as u64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sanctum Fair Price: {}", fair_value);
                msg!("Swap Ratio: {}", swap_ratio);
                msg!("Pyth Ratio: {}", ratio);

                msg!("Lower Bound Peg: {}", lower_bound_peg);

                // Checking Pyth Price vs Sanctum Fair Price (Depeg)
                if lower_bound_peg <= swap_ratio {
                    msg!("Pairs are within acceptable peg Fair Price vs Spot");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Fair Price vs Pyth");
                    return Err(CustomError::DeppegedPair.into());
                }

                // Checking Pyth Price vs Swap (difference between the best Spot)
                if lower_bound as u64 <= swap_ratio {
                    msg!("Pairs are within acceptable Pyth vs Spot");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Pyth vs Spot - Too Cheap");
                    return Err(CustomError::DeppegedPair.into());
                }

                // pokud swap_ratio * lst withdraw je vetsi nez lst deposits, tak ja mu poslu jen lst deposits * swap_ratio a vynuluju vse

                let deposit_ratio = total_withdrawable
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(participant.lst_deposits)
                    .ok_or(CustomError::ArithmeticError)?;

                // Check INF/SOL ratio and adjust withdrawals

                if received_amount_b > participant.lst_deposits {
                    return Err(CustomError::ArithmeticError.into());
                }

                if received_amount_a == total_withdrawable {
                    // If user is withdrawing all of their deposit, adjust everything accordingly
                    if swap_ratio >= deposit_ratio {
                        participant.deposit = 0;
                        participant.lst_deposits = 0;
                        participant.pending_deposit = 0;
                    } else {
                        return Err(CustomError::WrongWithdrawFunction.into());
                    }
                } else {
                    if participant.pending_deposit >= received_amount_a {
                        let pending_withdrawal = received_amount_a;
                        participant.pending_deposit = participant
                            .pending_deposit
                            .checked_sub(pending_withdrawal)
                            .ok_or(CustomError::ArithmeticError)?;
                    } else {
                        let pending_withdrawal = participant.pending_deposit;
                        let deposit_withdrawal = received_amount_a
                            .checked_sub(pending_withdrawal)
                            .ok_or(CustomError::ArithmeticError)?;
                        participant.pending_deposit = 0;
                        participant.deposit = participant
                            .deposit
                            .checked_sub(deposit_withdrawal)
                            .ok_or(CustomError::ArithmeticError)?;
                    }
                    participant.lst_deposits = participant
                        .lst_deposits
                        .checked_sub(received_amount_b)
                        .ok_or(CustomError::ArithmeticError)?;
                }

                lottery_account.total_deposits = lottery_account
                    .total_deposits
                    .checked_sub(received_amount_a)
                    .ok_or(CustomError::ArithmeticError)?;
                lottery_account.lst_total_deposits = lottery_account
                    .lst_total_deposits
                    .checked_sub(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                // Sync the PDA house account to convert WSOL to SOL
                let sync_balance_ix = spl_token::instruction::sync_native(
                    &spl_token::ID,
                    &ctx.accounts.token_owner_account_a.key(),
                )?;
                invoke_signed(
                    &sync_balance_ix,
                    &[
                        ctx.accounts.token_owner_account_a.to_account_info(),
                        ctx.accounts.token_program.to_account_info(),
                    ],
                    &[seeds],
                )?;

                // Close WSOL account and transfer SOL to user
                let close_wsol_ix = spl_token::instruction::close_account(
                    &spl_token::ID,
                    &ctx.accounts.token_owner_account_a.key(),
                    &user.key(),
                    &ctx.accounts.pda_house_acc.key(),
                    &[],
                )?;
                invoke_signed(
                    &close_wsol_ix,
                    &[
                        ctx.accounts.token_owner_account_a.to_account_info(),
                        user.to_account_info(),
                        pda_house_acc.to_account_info(),
                        ctx.accounts.token_program.to_account_info(),
                    ],
                    &[seeds],
                )?;
            }
            Err(err) => {
                msg!("Whirlpool swap failed: {:?}", err);
                return Err(err);
            }
        }

        Ok(())
    }

    pub fn withdraw_with_ratio_loss(
        ctx: Context<Withdraw>,
        amount: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
        _slippage: u64,
        depeg_protection: bool,
    ) -> Result<()> {
        // let system_address = &mut ctx.accounts.system_program;
        let user = &mut ctx.accounts.user;
        let lottery_account = &mut ctx.accounts.lottery_account;
        let pda_house_acc = &ctx.accounts.pda_house_acc;

        // Najděte účastníka v účtu loterie
        if !(amount_specified_is_input && !a_to_b) {
            return err!(CustomError::InvalidArguments);
        }

        // Find participant in the lottery account
        let participant = lottery_account
            .participants
            .iter_mut()
            .find(|p| p.pubkey == user.key())
            .ok_or(CustomError::InsufficientBalance)?;

        require!(
            participant.lst_deposits >= amount,
            CustomError::InsufficientBalance
        );

        let total_withdrawable = participant
            .pending_deposit
            .checked_add(participant.deposit)
            .ok_or(CustomError::ArithmeticError)?;

        let (pda_house_wallet_address, bump_seed) =
            Pubkey::find_program_address(&[&b"LotteryWallet"[..]], ctx.program_id);

        if pda_house_acc.key != &pda_house_wallet_address {
            return err!(CustomError::InvalidAccounts);
        }

        let seeds = &[&b"LotteryWallet"[..], &[bump_seed]];

        let initial_balance_a = ctx.accounts.token_owner_account_a.amount;
        let initial_balance_b = ctx.accounts.token_owner_account_b.amount;

        msg!("Initial Balance amount A: {}", initial_balance_a);
        msg!("Initial Balance amount B: {}", initial_balance_b);

        // Whirlpool swap logic
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let ta0 = unpack_tick_array(&ctx.accounts.tick_array_0)?;
        msg!("start_tick_index: {}", ta0.start_tick_index);

        let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap {
            whirlpool: ctx.accounts.whirlpool.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_authority: ctx.accounts.pda_house_acc.to_account_info(),
            token_owner_account_a: ctx.accounts.token_owner_account_a.to_account_info(),
            token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
            token_owner_account_b: ctx.accounts.token_owner_account_b.to_account_info(),
            token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
            tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
            tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
            tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
            oracle: ctx.accounts.oracle.to_account_info(),
        };

        let seedss: &[&[u8]] = &[&b"LotteryWallet"[..], &[bump_seed]];
        let signer_seeds: &[&[&[u8]]] = &[&seedss];

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);
        let result = whirlpool_cpi::cpi::swap(
            cpi_ctx,
            amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );

        match result {
            Ok(_) => {
                msg!("Whirlpool swap successful");

                ctx.accounts.token_owner_account_a.reload()?;
                ctx.accounts.token_owner_account_b.reload()?;

                // Fetch final balances
                let final_balance_a = ctx.accounts.token_owner_account_a.amount;
                let final_balance_b = ctx.accounts.token_owner_account_b.amount;
                // Log the received amounts
                msg!("Final Balance A: {}", final_balance_a);
                msg!("Final Balance B: {}", final_balance_b);

                // Calculate received amounts
                let received_amount_a = final_balance_a
                    .checked_sub(initial_balance_a)
                    .ok_or(CustomError::ArithmeticError)?;
                let received_amount_b = initial_balance_b
                    .checked_sub(final_balance_b)
                    .ok_or(CustomError::ArithmeticError)?;

                // Log the received amounts
                msg!("Received SOL token A: {}", received_amount_a);
                msg!("Withdrew INF: {}", received_amount_b);

                // Oracle Check
                let sol_price = fetch_price(&ctx.accounts.sol_oracle_account, true, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sol Price: {}", sol_price);

                let inf_price = fetch_price(&ctx.accounts.inf_oracle_account, false, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Inf Price: {}", inf_price);

                let ratio = inf_price
                    .checked_mul(SCALE as i64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(sol_price)
                    .ok_or(CustomError::ArithmeticError)?;

                let swap_ratio = received_amount_a
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                let adjustment_value = if depeg_protection { 20 } else { 50 };
                msg!("Depeg Protection: {}", adjustment_value);

                let lower_bound = ratio
                    .checked_mul(10000 - adjustment_value)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                // Deserialize pool_state
                let pool_state_data: &[u8] = &ctx.accounts.pool_state.try_borrow_data()?;
                let pool_state: PoolState = PoolState::try_from_slice(pool_state_data)
                    .map_err(|_| CustomError::DeserializationError)?;

                let fair_value = (pool_state.total_sol_value as u128)
                    .checked_mul(SCALE as u128)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(ctx.accounts.inf_mint.supply as u128)
                    .ok_or(CustomError::ArithmeticError)? as u64;

                let lower_bound_peg = fair_value
                    .checked_mul((10000 - adjustment_value) as u64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sanctum Fair Price: {}", fair_value);
                msg!("Swap Ratio: {}", swap_ratio);
                msg!("Pyth Ratio: {}", ratio);

                msg!("Lower Bound Peg: {}", lower_bound_peg);

                // Checking Pyth Price vs Sanctum Fair Price (Depeg)
                if lower_bound_peg <= swap_ratio {
                    msg!("Pairs are within acceptable peg Fair Price vs Spot");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Fair Price vs Spot");
                    return Err(CustomError::DeppegedPair.into());
                }

                // Checking Pyth Price vs Swap (difference between the best Spot)
                if lower_bound as u64 <= swap_ratio {
                    msg!("Pairs are within acceptable peg Pyth vs Spot");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Pyth vs Spot - Too Cheap");
                    return Err(CustomError::DeppegedPair.into());
                }

                // pokud swap_ratio * lst withdraw je vetsi nez lst deposits, tak ja mu poslu jen lst deposits * swap_ratio a vynuluju vse
                // pending deposits nezapomen

                let deposit_ratio = total_withdrawable
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(participant.lst_deposits)
                    .ok_or(CustomError::ArithmeticError)?;

                // Check INF/SOL ratio and adjust withdrawals
                if received_amount_b > participant.lst_deposits {
                    return Err(CustomError::ArithmeticError.into());
                }

                if participant.lst_deposits > received_amount_b
                    && received_amount_a >= total_withdrawable
                {
                    return Err(CustomError::WrongWithdrawFunction.into());
                }

                // ! jsou tady 3 scenáře nebo 2? Excel!
                if received_amount_b == participant.lst_deposits {
                    // If user is withdrawing all of their deposit, adjust everything accordingly
                    if swap_ratio >= deposit_ratio {
                        return Err(CustomError::WrongWithdrawFunction.into());
                    } else {
                        participant.deposit = 0;
                        participant.lst_deposits = 0;
                        participant.pending_deposit = 0;

                        lottery_account.total_deposits = lottery_account
                            .total_deposits
                            .checked_sub(total_withdrawable)
                            .ok_or(CustomError::ArithmeticError)?;
                    }
                } else {
                    if participant.pending_deposit >= received_amount_a {
                        let pending_withdrawal = received_amount_a;
                        participant.pending_deposit = participant
                            .pending_deposit
                            .checked_sub(pending_withdrawal)
                            .ok_or(CustomError::ArithmeticError)?;
                    } else {
                        let pending_withdrawal = participant.pending_deposit;
                        let deposit_withdrawal = received_amount_a
                            .checked_sub(pending_withdrawal)
                            .ok_or(CustomError::ArithmeticError)?;
                        participant.pending_deposit = 0;
                        participant.deposit = participant
                            .deposit
                            .checked_sub(deposit_withdrawal)
                            .ok_or(CustomError::ArithmeticError)?;
                    }
                    participant.lst_deposits = participant
                        .lst_deposits
                        .checked_sub(received_amount_b)
                        .ok_or(CustomError::ArithmeticError)?;

                    lottery_account.total_deposits = lottery_account
                        .total_deposits
                        .checked_sub(received_amount_a)
                        .ok_or(CustomError::ArithmeticError)?;
                }

                lottery_account.lst_total_deposits = lottery_account
                    .lst_total_deposits
                    .checked_sub(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                // Sync the PDA house account to convert WSOL to SOL
                let sync_balance_ix = spl_token::instruction::sync_native(
                    &spl_token::ID,
                    &ctx.accounts.token_owner_account_a.key(),
                )?;
                invoke_signed(
                    &sync_balance_ix,
                    &[
                        ctx.accounts.token_owner_account_a.to_account_info(),
                        ctx.accounts.token_program.to_account_info(),
                    ],
                    &[seeds],
                )?;

                // Close WSOL account and transfer SOL to user
                let close_wsol_ix = spl_token::instruction::close_account(
                    &spl_token::ID,
                    &ctx.accounts.token_owner_account_a.key(),
                    &user.key(),
                    &ctx.accounts.pda_house_acc.key(),
                    &[],
                )?;
                invoke_signed(
                    &close_wsol_ix,
                    &[
                        ctx.accounts.token_owner_account_a.to_account_info(),
                        user.to_account_info(),
                        pda_house_acc.to_account_info(),
                        ctx.accounts.token_program.to_account_info(),
                    ],
                    &[seeds],
                )?;
            }
            Err(err) => {
                msg!("Whirlpool swap failed: {:?}", err);
                return Err(err);
            }
        }

        Ok(())
    }

    pub fn withdraw_team_yield(
        ctx: Context<WithdrawTeamYield>,
        amount: u64,
        other_amount_threshold: u64,
        sqrt_price_limit: u128,
        amount_specified_is_input: bool,
        a_to_b: bool,
        _slippage: u64,
    ) -> Result<()> {
        // let system_address = &mut ctx.accounts.system_program;
        let user = &mut ctx.accounts.user;
        let lottery_account = &mut ctx.accounts.lottery_account;
        let pda_house_acc = &ctx.accounts.pda_house_acc;

        if amount_specified_is_input && a_to_b {
            return err!(CustomError::InvalidArguments);
        }

        require!(
            lottery_account.team_yield >= amount,
            CustomError::InsufficientBalance
        );

        let (pda_house_wallet_address, bump_seed) =
            Pubkey::find_program_address(&[&b"LotteryWallet"[..]], ctx.program_id);

        if pda_house_acc.key != &pda_house_wallet_address {
            return err!(CustomError::InvalidAccounts);
        }

        let seeds = &[&b"LotteryWallet"[..], &[bump_seed]];

        let initial_balance_a = ctx.accounts.token_owner_account_a.amount;
        let initial_balance_b = ctx.accounts.token_owner_account_b.amount;

        msg!("Initial Balance amount A: {}", initial_balance_a);
        msg!("Initial Balance amount B: {}", initial_balance_b);

        // Whirlpool swap logic
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let ta0 = unpack_tick_array(&ctx.accounts.tick_array_0)?;
        msg!("start_tick_index: {}", ta0.start_tick_index);

        let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap {
            whirlpool: ctx.accounts.whirlpool.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_authority: ctx.accounts.pda_house_acc.to_account_info(),
            token_owner_account_a: ctx.accounts.token_owner_account_a.to_account_info(),
            token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
            token_owner_account_b: ctx.accounts.token_owner_account_b.to_account_info(),
            token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
            tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
            tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
            tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
            oracle: ctx.accounts.oracle.to_account_info(),
        };

        let seedss: &[&[u8]] = &[&b"LotteryWallet"[..], &[bump_seed]];
        let signer_seeds: &[&[&[u8]]] = &[&seedss];

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);
        let result = whirlpool_cpi::cpi::swap(
            cpi_ctx,
            amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );

        match result {
            Ok(_) => {
                msg!("Whirlpool swap successful");

                ctx.accounts.token_owner_account_a.reload()?;
                ctx.accounts.token_owner_account_b.reload()?;

                // Fetch final balances
                let final_balance_a = ctx.accounts.token_owner_account_a.amount;
                let final_balance_b = ctx.accounts.token_owner_account_b.amount;
                // Log the received amounts
                msg!("Final Balance A: {}", final_balance_a);
                msg!("Final Balance B: {}", final_balance_b);

                // Calculate received amounts
                let received_amount_a = final_balance_a
                    .checked_sub(initial_balance_a)
                    .ok_or(CustomError::ArithmeticError)?;
                let received_amount_b = initial_balance_b
                    .checked_sub(final_balance_b)
                    .ok_or(CustomError::ArithmeticError)?;

                // Log the received amounts
                msg!("Received SOL token A: {}", received_amount_a);
                msg!("Withdrew INF: {}", received_amount_b);

                // Oracle Check
                let sol_price = fetch_price(&ctx.accounts.sol_oracle_account, true, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sol Price: {}", sol_price);

                let inf_price = fetch_price(&ctx.accounts.inf_oracle_account, false, 90)?
                    .checked_div(1000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Inf Price: {}", inf_price);

                let ratio = inf_price
                    .checked_mul(SCALE as i64)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(sol_price)
                    .ok_or(CustomError::ArithmeticError)?;

                let swap_ratio = received_amount_a
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                let lower_bound = ratio
                    .checked_mul(10000 - 20)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                // Deserialize pool_state
                let pool_state_data: &[u8] = &ctx.accounts.pool_state.try_borrow_data()?;
                let pool_state: PoolState = PoolState::try_from_slice(pool_state_data)
                    .map_err(|_| CustomError::DeserializationError)?;

                let fair_value = (pool_state.total_sol_value as u128)
                    .checked_mul(SCALE as u128)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(ctx.accounts.inf_mint.supply as u128)
                    .ok_or(CustomError::ArithmeticError)? as u64;

                let fair_value_ratio = fair_value as i64;
                let lower_bound_peg = fair_value_ratio
                    .checked_mul(10000 - 20)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(10000)
                    .ok_or(CustomError::ArithmeticError)?;

                msg!("Sanctum Fair Price: {}", fair_value);
                msg!("Swap Ratio: {}", swap_ratio);
                msg!("Pyth Ratio: {}", ratio);

                msg!("Lower Bound Peg: {}", lower_bound_peg);

                // Checking Pyth Price vs Sanctum Fair Price (Depeg)
                if lower_bound_peg <= ratio {
                    msg!("Pairs are within acceptable peg Fair Price vs Pyth");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Fair Price vs Pyth");
                    return Err(CustomError::DeppegedPair.into());
                }

                // Checking Pyth Price vs Swap (difference between the best Spot)
                if lower_bound as u64 <= swap_ratio {
                    msg!("Pairs are within acceptable peg Pyth vs Spot");
                // Pokračovat v operaci
                } else {
                    msg!("Pairs are deppeged Pyth vs Spot - Too Expensive");
                    return Err(CustomError::DeppegedPair.into());
                }

                let team_yield = lottery_account.team_yield;

                let deposit_ratio = team_yield
                    .checked_mul(SCALE)
                    .ok_or(CustomError::ArithmeticError)?
                    .checked_div(lottery_account.team_lst_yield)
                    .ok_or(CustomError::ArithmeticError)?;

                // Check INF/SOL ratio and adjust withdrawals

                if received_amount_b > lottery_account.team_lst_yield {
                    return Err(CustomError::ArithmeticError.into());
                }

                if received_amount_a == team_yield {
                    // If user is withdrawing all of their deposit, adjust everything accordingly
                    if swap_ratio >= deposit_ratio {
                        lottery_account.team_yield = 0;
                        lottery_account.team_lst_yield = 0;
                    } else {
                        return Err(CustomError::WrongWithdrawFunction.into());
                    }
                } else {
                    lottery_account.team_yield = lottery_account
                        .team_yield
                        .checked_sub(received_amount_a)
                        .ok_or(CustomError::ArithmeticError)?;

                    lottery_account.team_lst_yield = lottery_account
                        .team_lst_yield
                        .checked_sub(received_amount_b)
                        .ok_or(CustomError::ArithmeticError)?;
                }

                lottery_account.total_deposits = lottery_account
                    .total_deposits
                    .checked_sub(received_amount_a)
                    .ok_or(CustomError::ArithmeticError)?;
                lottery_account.lst_total_deposits = lottery_account
                    .lst_total_deposits
                    .checked_sub(received_amount_b)
                    .ok_or(CustomError::ArithmeticError)?;

                // Sync the PDA house account to convert WSOL to SOL
                let sync_balance_ix = spl_token::instruction::sync_native(
                    &spl_token::ID,
                    &ctx.accounts.token_owner_account_a.key(),
                )?;
                invoke_signed(
                    &sync_balance_ix,
                    &[
                        ctx.accounts.token_owner_account_a.to_account_info(),
                        ctx.accounts.token_program.to_account_info(),
                    ],
                    &[seeds],
                )?;

                // Close WSOL account and transfer SOL to user
                let close_wsol_ix = spl_token::instruction::close_account(
                    &spl_token::ID,
                    &ctx.accounts.token_owner_account_a.key(),
                    &user.key(),
                    &ctx.accounts.pda_house_acc.key(),
                    &[],
                )?;
                invoke_signed(
                    &close_wsol_ix,
                    &[
                        ctx.accounts.token_owner_account_a.to_account_info(),
                        user.to_account_info(),
                        pda_house_acc.to_account_info(),
                        ctx.accounts.token_program.to_account_info(),
                    ],
                    &[seeds],
                )?;
            }
            Err(err) => {
                msg!("Whirlpool swap failed: {:?}", err);
                return Err(err);
            }
        }

        Ok(())
    }

    // delay lottery
    pub fn delay_lottery(ctx: Context<DelayLottery>) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let lottery_account = &mut ctx.accounts.lottery_account;

        if current_time < lottery_account.small_lottery_time {
            return err!(CustomError::LotteryTimeIsnotUp);
        }

        // DID
        if lottery_account.small_lottery_happened == true {
            return Err(CustomError::LotteryDidNotHappen.into());
        }

        if lottery_account.big_lottery_happened == true {
            return Err(CustomError::LotteryDidNotHappen.into());
        }

        let pool_state_data: &[u8] = &ctx.accounts.pool_state.try_borrow_data()?;
        let pool_state: PoolState = PoolState::try_from_slice(pool_state_data)
            .map_err(|_| CustomError::DeserializationError)?;

        let fair_value = (pool_state.total_sol_value as u128)
            .checked_mul(SCALE as u128)
            .ok_or(CustomError::ArithmeticError)?
            .checked_div(ctx.accounts.inf_mint.supply as u128)
            .ok_or(CustomError::ArithmeticError)? as u64;

        let spot_ratio =
            pricemath_sqrt_price_x64_to_inverted_price(ctx.accounts.whirlpool.sqrt_price)?
                .checked_mul(9999)
                .ok_or(CustomError::ArithmeticError)?
                .checked_div(10000)
                .ok_or(CustomError::ArithmeticError)?;

        let fair_value_ratio = fair_value as i64;
        let spot_fair_difference = (fair_value_ratio - spot_ratio).abs();

        let threshold = fair_value_ratio
            .checked_mul(15)
            .ok_or(CustomError::ArithmeticError)?
            .checked_div(10000)
            .ok_or(CustomError::ArithmeticError)?;

        if spot_fair_difference < threshold {
            return err!(CustomError::NotDeppegedPair);
        }
        // delay podle lottery to big
        msg!("current_time: {}", current_time);
        let small_lottery_timestamp = current_time + 60 * 60 * 4;
        msg!("next_small_lottery: {}", small_lottery_timestamp);

        lottery_account.small_lottery_time = small_lottery_timestamp;
        let delay = 4_u8
            .checked_sub(lottery_account.small_lottery_to_big)
            .ok_or(CustomError::ArithmeticError)?;

        let big_lottery_timestamp = current_time + 60 * 60 * 4 * delay as i64;
        msg!("next_big_lottery: {}", big_lottery_timestamp);
        lottery_account.big_lottery_time = big_lottery_timestamp;

        Ok(())
    }

    pub fn commit_randomness(
        ctx: Context<CommitRandomness>,
        randomness_account: Pubkey,
        small_lottery: bool,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let lottery_account = &mut ctx.accounts.lottery_account;
        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .unwrap();

        if randomness_data.seed_slot != clock.slot - 1 {
            msg!("seed_slot: {}", randomness_data.seed_slot);
            msg!("slot: {}", clock.slot);
            return err!(CustomError::RandomnessAlreadyRevealed);
        }

        // add checks
        if small_lottery == true {
            if lottery_account.small_lottery_happened == false {
                return err!(CustomError::LotteryDidNotHappen);
            }

            // maybe if small lottery == 1 and big lottery happened == true tak error, commit big lottery first

            if lottery_account.small_lottery_to_big == 0
                && lottery_account.big_lottery_happened == true
            {
                return err!(CustomError::BigLotteryCommitFirst);
            }

            if lottery_account.small_lottery_to_big == 4 {
                return err!(CustomError::LotteryTimeIsnotUp);
            }

            // Commit the current slot and randomness account
            lottery_account.small_commit_slot = randomness_data.seed_slot;
            lottery_account.small_randomness_account = randomness_account;

            msg!("current_time: {}", current_time);
            let small_lottery_timestamp = current_time + 60 * 60 * 24 * 7;
            msg!("next_small_lottery: {}", small_lottery_timestamp);
            lottery_account.small_lottery_time = small_lottery_timestamp;
            lottery_account.small_lottery_happened = false;
        } else {
            if lottery_account.big_lottery_happened == false {
                return err!(CustomError::LotteryDidNotHappen);
            }

            // pohrát si tady s tim jak to bude fungovat, jinak ready
            if lottery_account.small_lottery_to_big != 0 {
                return err!(CustomError::LotteryTimeIsnotUp);
            }

            // Commit the current slot and randomness account
            lottery_account.big_commit_slot = randomness_data.seed_slot;
            lottery_account.big_randomness_account = randomness_account;

            msg!("current_time: {}", current_time);
            let big_lottery_timestamp = current_time + 60 * 60 * 24 * 7 * 4;
            msg!("next_big_lottery: {}", big_lottery_timestamp);
            lottery_account.big_lottery_time = big_lottery_timestamp;
            lottery_account.big_lottery_happened = false;
        }

        // Log the commit
        msg!(
            "Randomness commit initiated at slot: {}",
            randomness_data.seed_slot
        );
        Ok(())
    }

    pub fn distribute_big_lottery_yield(ctx: Context<DistributeSmallLotteryYield>) -> Result<()> {
        let lottery_account = &mut ctx.accounts.lottery_account;
        let randomness_account_data = &ctx.accounts.randomness_account_data;

        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Remove participants with zero deposits
        lottery_account.participants.retain(|participant| {
            participant.deposit > 0
                || participant.lst_deposits > 0
                || participant.pending_deposit > 0
        });

        if lottery_account.participants.len() < 2 {
            return err!(CustomError::NotEnoughParticipants);
        }

        if current_time < lottery_account.big_lottery_time {
            return err!(CustomError::LotteryTimeIsnotUp);
        }

        if lottery_account.big_lottery_happened == true {
            return err!(CustomError::LotteryDidNotHappen);
        }

        if lottery_account.small_lottery_to_big < 4 {
            return err!(CustomError::LotteryTimeIsnotUp);
        }

        let randomness_data =
            RandomnessAccountData::parse(randomness_account_data.data.borrow()).unwrap();

        // Ensure the randomness is from the correct slot
        if randomness_data.seed_slot != lottery_account.big_commit_slot {
            return err!(CustomError::RandomnessSlotMismatch);
        }

        let random_value = randomness_data.get_value(&clock).unwrap();
        if random_value.len() < 4 {
            return err!(CustomError::InsufficientRandomness);
        }

        // Calculate total deposits
        let total_user_deposits: u64 = lottery_account.participants.iter().map(|p| p.deposit).sum();

        // Create intervals
        let mut intervals = Vec::new();
        let mut cumulative_sum = 0;
        for participant in &lottery_account.participants {
            cumulative_sum += participant.deposit;
            intervals.push((participant.pubkey, cumulative_sum));
        }

        // Select winners
        let winner1_pubkey = select_winner(&random_value, 0, &intervals, total_user_deposits);

        let total_yield = lottery_account.big_lottery_yield;

        let total_lst_yield = lottery_account.big_lst_lottery_yield;

        msg!("Lottery Yield: {}", lottery_account.big_lottery_yield);

        emit!(BigLotteryWinningEvent {
            winner: winner1_pubkey,
            lottery_yield: total_yield as i64,
        });

        lottery_account.big_lottery_happened = true;
        lottery_account.small_lottery_to_big = 0;

        // Update the winners' deposits
        for participant in &mut lottery_account.participants {
            if participant.pubkey == winner1_pubkey {
                participant.deposit = participant
                    .deposit
                    .checked_add(total_yield)
                    .ok_or(CustomError::ArithmeticError)?;

                participant.lst_deposits = participant
                    .lst_deposits
                    .checked_add(total_lst_yield)
                    .ok_or(CustomError::ArithmeticError)?;
            }
        }

        lottery_account.big_lottery_yield = 0;
        lottery_account.big_lst_lottery_yield = 0;

        Ok(())
    }

    pub fn distribute_small_lottery_yield(ctx: Context<DistributeSmallLotteryYield>) -> Result<()> {
        let lottery_account = &mut ctx.accounts.lottery_account;
        let randomness_account_data = &ctx.accounts.randomness_account_data;

        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Remove participants with zero deposits
        lottery_account.participants.retain(|participant| {
            participant.deposit > 0
                || participant.lst_deposits > 0
                || participant.pending_deposit > 0
        });

        if lottery_account.participants.len() < 2 {
            return err!(CustomError::NotEnoughParticipants);
        }

        if current_time < lottery_account.small_lottery_time {
            return err!(CustomError::LotteryTimeIsnotUp);
        }

        if lottery_account.small_lottery_to_big == 4 {
            return err!(CustomError::LotteryTimeIsnotUp);
        }

        if lottery_account.small_lottery_happened == true {
            return Err(CustomError::LotteryDidNotHappen.into());
        }

        let randomness_data =
            RandomnessAccountData::parse(randomness_account_data.data.borrow()).unwrap();

        // Ensure the randomness is from the correct slot
        if randomness_data.seed_slot != lottery_account.small_commit_slot {
            return err!(CustomError::RandomnessSlotMismatch);
        }

        let random_value = randomness_data.get_value(&clock).unwrap();
        if random_value.len() < 4 {
            return err!(CustomError::InsufficientRandomness);
        }

        // Calculate total deposits
        let total_user_deposits: u64 = lottery_account.participants.iter().map(|p| p.deposit).sum();

        // Create intervals
        let mut intervals = Vec::new();
        let mut cumulative_sum = 0;
        for participant in &lottery_account.participants {
            cumulative_sum += participant.deposit;
            intervals.push((participant.pubkey, cumulative_sum));
        }

        // Select winners
        let winner1_pubkey = select_winner(&random_value, 0, &intervals, total_user_deposits);
        let mut winner2_pubkey = select_winner(&random_value, 1, &intervals, total_user_deposits);

        // Ensure winner2 is different from winner1
        let mut offset = 2;
        while winner2_pubkey == winner1_pubkey {
            msg!("Winner2 is same as Winner1, selecting again...");
            winner2_pubkey = select_winner(&random_value, offset, &intervals, total_user_deposits);
            offset += 1;
        }

        // Oracle Check
        let sol_price = fetch_price(&ctx.accounts.sol_oracle_account, true, 90)?
            .checked_div(1000)
            .ok_or(CustomError::ArithmeticError)?;

        msg!("Sol Price: {}", sol_price);

        let inf_price = fetch_price(&ctx.accounts.inf_oracle_account, false, 90)?
            .checked_div(1000)
            .ok_or(CustomError::ArithmeticError)?;

        msg!("Inf Price: {}", inf_price);

        // Deserialize pool_state
        let pool_state_data: &[u8] = &ctx.accounts.pool_state.try_borrow_data()?;
        let pool_state: PoolState = PoolState::try_from_slice(pool_state_data)
            .map_err(|_| CustomError::DeserializationError)?;

        let fair_value = (pool_state.total_sol_value as u128)
            .checked_mul(SCALE as u128)
            .ok_or(CustomError::ArithmeticError)?
            .checked_div(ctx.accounts.inf_mint.supply as u128)
            .ok_or(CustomError::ArithmeticError)? as u64;

        let spot_ratio =
            pricemath_sqrt_price_x64_to_inverted_price(ctx.accounts.whirlpool.sqrt_price)?
                .checked_mul(9999)
                .ok_or(CustomError::ArithmeticError)?
                .checked_div(10000)
                .ok_or(CustomError::ArithmeticError)?;

        let ratio = inf_price
            .checked_mul(SCALE as i64)
            .ok_or(CustomError::ArithmeticError)?
            .checked_div(sol_price)
            .ok_or(CustomError::ArithmeticError)?;

        let fair_value_ratio = fair_value as i64;
        let pyth_fair_difference = (fair_value_ratio - ratio).abs();
        let spot_fair_difference = (fair_value_ratio - spot_ratio).abs();

        let threshold = fair_value_ratio
            .checked_mul(15)
            .ok_or(CustomError::ArithmeticError)?
            .checked_div(10000)
            .ok_or(CustomError::ArithmeticError)?;

        msg!("Pyth Price: {}", ratio);
        msg!("Spot Price: {}", spot_ratio);
        msg!("Fair Price: {}", fair_value);

        msg!("Max Depeg {}", threshold);

        msg!("Pyth Depeg: {}", pyth_fair_difference);
        msg!("Spot Depeg: {}", spot_fair_difference);

        if pyth_fair_difference > threshold {
            return err!(CustomError::DeppegedPair);
        }

        if spot_fair_difference > threshold {
            return err!(CustomError::DeppegedPair);
        }

        let total_deposits = lottery_account.total_deposits;
        msg!("Total Deposits: {}", total_deposits);
        msg!("Total LST Deposits: {}", lottery_account.lst_total_deposits);

        let lst_value_in_sol_scaled: i128 = (spot_ratio as i128)
            .checked_mul(lottery_account.lst_total_deposits as i128)
            .ok_or(CustomError::ArithmeticError)?;

        let lst_value_in_sol_i128 = lst_value_in_sol_scaled
            .checked_div(SCALE as i128)
            .ok_or(CustomError::ArithmeticError)?;

        // Check if the result fits into i64, otherwise return an error
        if lst_value_in_sol_i128 > i64::MAX as i128 || lst_value_in_sol_i128 < i64::MIN as i128 {
            return Err(CustomError::ArithmeticError.into());
        }

        // Convert the value back to i64
        let lst_value_in_sol = lst_value_in_sol_i128 as i64;
        msg!("LST Value in SOL: {}", lst_value_in_sol);

        let total_yield = lst_value_in_sol
            .checked_sub(total_deposits as i64)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Total Yield: {}", total_yield);

        // Check if total_yield is negative
        if total_yield < 0 {
            return err!(CustomError::NegativeYieldError);
        }

        let team_yield = total_yield
            .checked_div(10)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Projects Yield: {}", team_yield);

        let winning_yield = total_yield
            .checked_sub(team_yield)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Winning Yield: {}", winning_yield);

        let small_winning_yield = winning_yield
            .checked_div(2)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Small Winning Yield: {}", small_winning_yield);

        let big_winning_yield_addition = winning_yield
            .checked_sub(small_winning_yield)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Adding {} to big Lottery", big_winning_yield_addition);

        // Calculate the yield for the winners
        let yield_for_winner1 = small_winning_yield
            .checked_div(2)
            .ok_or(CustomError::ArithmeticError)?;
        let yield_for_winner2 = small_winning_yield
            .checked_sub(yield_for_winner1)
            .ok_or(CustomError::ArithmeticError)?;

        msg!("Pubkey for 1: {}", winner1_pubkey);
        msg!("Yield for 1: {}", yield_for_winner1);

        msg!("Pubkey for 2: {}", winner2_pubkey);
        msg!("Yield for 2: {}", yield_for_winner2);

        lottery_account.small_lottery_happened = true;

        if lottery_account.small_lottery_to_big >= 4 {
            return err!(CustomError::BigLotteryFirst);
        } else {
            lottery_account.small_lottery_to_big += 1;
        }

        let total_lst_yield_i128 = (total_yield as i128)
            .checked_mul(100000000 as i128)
            .ok_or(CustomError::ArithmeticError)?
            .checked_div(spot_ratio as i128)
            .ok_or(CustomError::ArithmeticError)?;

        // Check if the result can fit into u64
        if total_lst_yield_i128 > i64::MAX as i128 {
            return err!(CustomError::InvalidArguments);
        }

        let total_lst_yield = total_lst_yield_i128 as i64;

        let lst_team_yield = total_lst_yield
            .checked_div(10)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Projects LST Yield: {}", lst_team_yield);

        let lst_winning_yield = total_lst_yield
            .checked_sub(lst_team_yield)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Winning LST Yield: {}", lst_winning_yield);

        let lst_small_winning_yield = lst_winning_yield
            .checked_div(2)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Small Winning LST Yield: {}", lst_small_winning_yield);

        let lst_big_winning_yield_addition = lst_winning_yield
            .checked_sub(lst_small_winning_yield)
            .ok_or(CustomError::ArithmeticError)?;
        msg!(
            "Adding {} LST to big Lottery",
            lst_big_winning_yield_addition
        );

        // Calculate the yield for the winners
        let lst_yield_for_winner1 = lst_small_winning_yield
            .checked_div(2)
            .ok_or(CustomError::ArithmeticError)?;
        let lst_yield_for_winner2 = lst_small_winning_yield
            .checked_sub(lst_yield_for_winner1)
            .ok_or(CustomError::ArithmeticError)?;

        // Sum all yields for total_deposits update
        let total_yield_summed = team_yield
            .checked_add(big_winning_yield_addition)
            .ok_or(CustomError::ArithmeticError)?
            .checked_add(yield_for_winner1)
            .ok_or(CustomError::ArithmeticError)?
            .checked_add(yield_for_winner2)
            .ok_or(CustomError::ArithmeticError)?;
        msg!("Total Yield Summed: {}", total_yield_summed);

        // Sum all yields for total_deposits update
        let total_lst_yield_summed = lst_team_yield
            .checked_add(lst_big_winning_yield_addition)
            .ok_or(CustomError::ArithmeticError)?
            .checked_add(lst_yield_for_winner1)
            .ok_or(CustomError::ArithmeticError)?
            .checked_add(lst_yield_for_winner2)
            .ok_or(CustomError::ArithmeticError)?;
        msg!(
            "Total LST Yield Summed without Inc: {}",
            total_lst_yield_summed
        );

        lottery_account.total_deposits = lottery_account
            .total_deposits
            .checked_add(total_yield_summed as u64)
            .ok_or(CustomError::ArithmeticError)?;

        lottery_account.big_lottery_yield = lottery_account
            .big_lottery_yield
            .checked_add(big_winning_yield_addition as u64)
            .ok_or(CustomError::ArithmeticError)?;

        lottery_account.big_lst_lottery_yield = lottery_account
            .big_lst_lottery_yield
            .checked_add(lst_big_winning_yield_addition as u64)
            .ok_or(CustomError::ArithmeticError)?;

        lottery_account.team_yield = lottery_account
            .team_yield
            .checked_add(team_yield as u64)
            .ok_or(CustomError::ArithmeticError)?;

        lottery_account.team_lst_yield = lottery_account
            .team_lst_yield
            .checked_add(lst_team_yield as u64)
            .ok_or(CustomError::ArithmeticError)?;

        // Update the winners' deposits
        for participant in &mut lottery_account.participants {
            if participant.pubkey == winner1_pubkey {
                participant.deposit = participant
                    .deposit
                    .checked_add(yield_for_winner1 as u64)
                    .ok_or(CustomError::ArithmeticError)?;
                participant.lst_deposits = participant
                    .lst_deposits
                    .checked_add(lst_yield_for_winner1 as u64)
                    .ok_or(CustomError::ArithmeticError)?;
            }
            if participant.pubkey == winner2_pubkey {
                participant.deposit = participant
                    .deposit
                    .checked_add(yield_for_winner2 as u64)
                    .ok_or(CustomError::ArithmeticError)?;
                participant.lst_deposits = participant
                    .lst_deposits
                    .checked_add(lst_yield_for_winner2 as u64)
                    .ok_or(CustomError::ArithmeticError)?;
            }
        }

        // Transfer pending_deposit to deposit for all participants
        for participant in &mut lottery_account.participants {
            participant.deposit = participant
                .deposit
                .checked_add(participant.pending_deposit)
                .ok_or(CustomError::ArithmeticError)?;
            participant.pending_deposit = 0;
        }

        emit!(SmallLotteryWinningEvent {
            winner: winner1_pubkey,
            lottery_yield: yield_for_winner1,
        });

        emit!(SmallLotteryWinningEvent {
            winner: winner2_pubkey,
            lottery_yield: yield_for_winner2,
        });

        Ok(())
    }

    pub fn reallocate_lottery_account(
        ctx: Context<ReallocateLotteryAccount>,
        new_size: u64,
    ) -> Result<()> {
        let lottery_account_info = &mut ctx.accounts.lottery_account.to_account_info();
        let current_size = lottery_account_info.data_len() as u64;
        let user = &mut ctx.accounts.user;
        let system_address = &mut ctx.accounts.system_program;

        if new_size > current_size {
            let increment = 4096; // 4KB
            let mut remaining_size = new_size - current_size;

            // Calculate the new rent-exempt balance
            let rent = Rent::get()?;
            let new_rent_exempt_balance = rent.minimum_balance(new_size as usize);

            // Check the current balance of the account
            let current_balance = lottery_account_info.lamports();

            // Transfer additional funds if necessary
            if current_balance < new_rent_exempt_balance {
                let additional_funds_needed = new_rent_exempt_balance - current_balance;

                transfer(
                    &user,
                    &lottery_account_info,
                    &system_address,
                    additional_funds_needed,
                )?;
            }

            while remaining_size > 0 {
                let size_to_allocate = if remaining_size > increment {
                    increment
                } else {
                    remaining_size
                };

                // Safely convert `u64` to `usize`
                let new_allocation_size: usize = (current_size + size_to_allocate)
                    .try_into()
                    .map_err(|_| anchor_lang::error!(CustomError::SizeConversionError))?;

                // Reallocate the account space in increments
                lottery_account_info.realloc(new_allocation_size, false)?;

                remaining_size -= size_to_allocate;
            }
        }

        Ok(())
    }

}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = house_acc, space = 4096, seeds = [house_acc.key.as_ref()], bump, constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    #[account(mut, signer, constraint = house_acc.key == &Pubkey::from_str(HOUSE_WALLET_ADDRESS).unwrap_or_default())]
    pub house_acc: AccountInfo<'info>,
    #[account(mut, constraint = pda_house_acc.key == &Pubkey::from_str(PDA_HOUSE_WALLET_ADDRESS).unwrap_or_default())]
    pub pda_house_acc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    #[account(mut, constraint = pda_house_acc.key == &Pubkey::from_str(PDA_HOUSE_WALLET_ADDRESS).unwrap_or_default())]
    pub pda_house_acc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    // Add Whirlpool swap accounts
    pub whirlpool_program: Program<'info, whirlpool_cpi::program::Whirlpool>,
    pub token_program: Program<'info, Token>,
    #[account(mut, constraint = whirlpool.key() == Pubkey::from_str(WHIRLPOOL_ADDRESS).unwrap_or_default())]
    pub whirlpool: Box<Account<'info, Whirlpool>>,
    #[account(init, payer = user, associated_token::mint = wsol_mint, associated_token::authority = pda_house_acc)]
    pub token_owner_account_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_a)]
    pub token_vault_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = token_owner_account_b.mint == whirlpool.token_mint_b)]
    pub token_owner_account_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_b)]
    pub token_vault_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_0: AccountLoader<'info, TickArray>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_1: AccountLoader<'info, TickArray>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_2: AccountLoader<'info, TickArray>,
    #[account(mut, seeds = [b"oracle", whirlpool.key().as_ref()], bump, seeds::program = whirlpool_program.key())]
    pub oracle: UncheckedAccount<'info>,
    #[account(mut, constraint = wsol_mint.key() == Pubkey::from_str(WSOL_MINT).unwrap_or_default())]
    pub wsol_mint: Box<Account<'info, Mint>>, // SPL Token Mint
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(constraint = sol_oracle_account.key() == Pubkey::from_str(ORACLE_SOL_ADDY).unwrap_or_default())]
    pub sol_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(constraint = inf_oracle_account.key() == Pubkey::from_str(ORACLE_INF_ADDY).unwrap_or_default())]
    pub inf_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(mut, constraint = inf_mint.key() == Pubkey::from_str(INF_MINT).unwrap_or_default())]
    pub inf_mint: Account<'info, Mint>,
    #[account(constraint = pool_state.key() == Pubkey::from_str(POOL_STATE).unwrap_or_default())]
    pub pool_state: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    #[account(mut, constraint = pda_house_acc.key == &Pubkey::from_str(PDA_HOUSE_WALLET_ADDRESS).unwrap_or_default())]
    pub pda_house_acc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    // Add Whirlpool swap accounts
    pub whirlpool_program: Program<'info, whirlpool_cpi::program::Whirlpool>,
    pub token_program: Program<'info, Token>,
    #[account(mut, constraint = whirlpool.key() == Pubkey::from_str(WHIRLPOOL_ADDRESS).unwrap_or_default())]
    pub whirlpool: Box<Account<'info, Whirlpool>>,
    #[account(init, payer = user, associated_token::mint = wsol_mint, associated_token::authority = pda_house_acc)]
    pub token_owner_account_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_a)]
    pub token_vault_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = token_owner_account_b.mint == whirlpool.token_mint_b)]
    pub token_owner_account_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_b)]
    pub token_vault_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_0: AccountLoader<'info, TickArray>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_1: AccountLoader<'info, TickArray>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_2: AccountLoader<'info, TickArray>,
    #[account(mut, seeds = [b"oracle", whirlpool.key().as_ref()], bump, seeds::program = whirlpool_program.key())]
    pub oracle: UncheckedAccount<'info>,
    #[account(mut, constraint = wsol_mint.key() == Pubkey::from_str(WSOL_MINT).unwrap_or_default())]
    pub wsol_mint: Box<Account<'info, Mint>>, // SPL Token Mint
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(constraint = sol_oracle_account.key() == Pubkey::from_str(ORACLE_SOL_ADDY).unwrap_or_default())]
    pub sol_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(constraint = inf_oracle_account.key() == Pubkey::from_str(ORACLE_INF_ADDY).unwrap_or_default())]
    pub inf_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(mut, constraint = inf_mint.key() == Pubkey::from_str(INF_MINT).unwrap_or_default())]
    pub inf_mint: Account<'info, Mint>,
    #[account(constraint = pool_state.key() == Pubkey::from_str(POOL_STATE).unwrap_or_default())]
    pub pool_state: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct WithdrawTeamYield<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    #[account(mut, signer, constraint = user.key == &Pubkey::from_str(HOUSE_WALLET_ADDRESS).unwrap_or_default())]
    pub user: AccountInfo<'info>,
    #[account(mut, constraint = pda_house_acc.key == &Pubkey::from_str(PDA_HOUSE_WALLET_ADDRESS).unwrap_or_default())]
    pub pda_house_acc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    // Add Whirlpool swap accounts
    pub whirlpool_program: Program<'info, whirlpool_cpi::program::Whirlpool>,
    pub token_program: Program<'info, Token>,
    #[account(mut, constraint = whirlpool.key() == Pubkey::from_str(WHIRLPOOL_ADDRESS).unwrap_or_default())]
    pub whirlpool: Box<Account<'info, Whirlpool>>,
    #[account(init, payer = user, associated_token::mint = wsol_mint, associated_token::authority = pda_house_acc)]
    pub token_owner_account_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_a)]
    pub token_vault_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = token_owner_account_b.mint == whirlpool.token_mint_b)]
    pub token_owner_account_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_b)]
    pub token_vault_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_0: AccountLoader<'info, TickArray>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_1: AccountLoader<'info, TickArray>,
    #[account(mut, has_one = whirlpool)]
    pub tick_array_2: AccountLoader<'info, TickArray>,
    #[account(mut, seeds = [b"oracle", whirlpool.key().as_ref()], bump, seeds::program = whirlpool_program.key())]
    pub oracle: UncheckedAccount<'info>,
    #[account(mut, constraint = wsol_mint.key() == Pubkey::from_str(WSOL_MINT).unwrap_or_default())]
    pub wsol_mint: Box<Account<'info, Mint>>, // SPL Token Mint
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(constraint = sol_oracle_account.key() == Pubkey::from_str(ORACLE_SOL_ADDY).unwrap_or_default())]
    pub sol_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(constraint = inf_oracle_account.key() == Pubkey::from_str(ORACLE_INF_ADDY).unwrap_or_default())]
    pub inf_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(mut, constraint = inf_mint.key() == Pubkey::from_str(INF_MINT).unwrap_or_default())]
    pub inf_mint: Account<'info, Mint>,
    #[account(constraint = pool_state.key() == Pubkey::from_str(POOL_STATE).unwrap_or_default())]
    pub pool_state: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DistributeSmallLotteryYield<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    /// CHECK: This is a simple Solana account holding randomness data
    pub randomness_account_data: AccountInfo<'info>,
    #[account(signer, constraint = user.key == &Pubkey::from_str(SIGNER_ADDRESS).unwrap_or_default())]
    pub user: AccountInfo<'info>,
    #[account(constraint = sol_oracle_account.key() == Pubkey::from_str(ORACLE_SOL_ADDY).unwrap_or_default())]
    pub sol_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(constraint = inf_oracle_account.key() == Pubkey::from_str(ORACLE_INF_ADDY).unwrap_or_default())]
    pub inf_oracle_account: Account<'info, PriceUpdateV2>,
    #[account(mut, constraint = inf_mint.key() == Pubkey::from_str(INF_MINT).unwrap_or_default())]
    pub inf_mint: Account<'info, Mint>,
    #[account(constraint = pool_state.key() == Pubkey::from_str(POOL_STATE).unwrap_or_default())]
    pub pool_state: AccountInfo<'info>,
    #[account(mut, constraint = whirlpool.key() == Pubkey::from_str(WHIRLPOOL_ADDRESS).unwrap_or_default())]
    pub whirlpool: Box<Account<'info, Whirlpool>>,
}

#[derive(Accounts)]
pub struct CommitRandomness<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    pub system_program: Program<'info, System>,
    #[account(signer, constraint = user.key == &Pubkey::from_str(SIGNER_ADDRESS).unwrap_or_default())]
    pub user: AccountInfo<'info>,
    /// checking in reveal fn
    pub randomness_account_data: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DelayLottery<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    pub system_program: Program<'info, System>,
    #[account(signer, constraint = user.key == &Pubkey::from_str(SIGNER_ADDRESS).unwrap_or_default())]
    pub user: AccountInfo<'info>,
    #[account(mut, constraint = whirlpool.key() == Pubkey::from_str(WHIRLPOOL_ADDRESS).unwrap_or_default())]
    pub whirlpool: Box<Account<'info, Whirlpool>>,
    #[account(mut, constraint = inf_mint.key() == Pubkey::from_str(INF_MINT).unwrap_or_default())]
    pub inf_mint: Account<'info, Mint>,
    #[account(constraint = pool_state.key() == Pubkey::from_str(POOL_STATE).unwrap_or_default())]
    pub pool_state: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ReallocateLotteryAccount<'info> {
    #[account(mut, constraint = lottery_account.key() == Pubkey::from_str(LOTTERY_ADDY).unwrap_or_default(), constraint = lottery_account.to_account_info().owner == __program_id)]
    pub lottery_account: Account<'info, LotteryAccount>,
    #[account(signer, constraint = user.key == &Pubkey::from_str(SIGNER_ADDRESS).unwrap_or_default())]
    pub user: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct LotteryAccount {
    pub is_initialized: bool,
    pub total_deposits: u64,
    pub lst_total_deposits: u64,
    pub participants: Vec<Participant>,
    pub small_commit_slot: u64,
    pub small_randomness_account: Pubkey,
    pub big_lottery_time: i64,
    pub big_lottery_happened: bool,
    pub small_lottery_time: i64,
    pub small_lottery_happened: bool,
    pub big_commit_slot: u64,
    pub big_randomness_account: Pubkey,
    pub team_yield: u64,
    pub big_lottery_yield: u64,
    pub small_lottery_to_big: u8,
    pub big_lst_lottery_yield: u64,
    pub team_lst_yield: u64,
}

#[repr(C)]
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq, Pod, Copy, Zeroable)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize)
)]
pub struct PoolState {
    pub total_sol_value: u64,
    pub trading_protocol_fee_bps: u16,
    pub lp_protocol_fee_bps: u16,
    pub version: u8,
    pub is_disabled: u8,
    pub is_rebalancing: u8,
    pub padding: [u8; 1],
    pub admin: Pubkey,
    pub rebalance_authority: Pubkey,
    pub protocol_fee_beneficiary: Pubkey,
    pub pricing_program: Pubkey,
    pub lp_token_mint: Pubkey,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Participant {
    pub pubkey: Pubkey,
    pub deposit: u64,
    pub lst_deposits: u64,
    pub pending_deposit: u64,
}

#[event]
pub struct SmallLotteryWinningEvent {
    pub winner: Pubkey,
    pub lottery_yield: i64,
}

#[event]
pub struct BigLotteryWinningEvent {
    pub winner: Pubkey,
    pub lottery_yield: i64,
}

#[error_code]
enum CustomError {
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Account is Initialized")]
    InitAccount,
    #[msg("Invalid Argument Supplied To the Program")]
    InvalidArguments,
    #[msg("Invalid Accounts Supplied To the Program")]
    InvalidAccounts,
    #[msg("Arithmetic Error")]
    ArithmeticError,
    #[msg("Pyth Price is Stale or there was an error fetching the price.")]
    StalePrice,
    #[msg("Only SOL and INF are supported.")]
    InvalidOracle,
    #[msg("Pairs are deppeged.")]
    DeppegedPair,
    #[msg("Pairs are not deppeged, not need for delay.")]
    NotDeppegedPair,
    #[msg("Wrong Withdraw Function.")]
    WrongWithdrawFunction,
    #[msg("Not enough participants for lottery")]
    NotEnoughParticipants,
    #[msg("Randomness slot mismatch")]
    RandomnessSlotMismatch,
    #[msg("InsufficientRandomness")]
    InsufficientRandomness,
    #[msg("This slot has been already used")]
    RandomnessAlreadyRevealed,
    #[msg("Lottery did not happen yet")]
    LotteryDidNotHappen,
    #[msg("Lottery is happening in future")]
    LotteryTimeIsnotUp,
    #[msg("Deserialization Error")]
    DeserializationError,
    #[msg("Lottery Yield can not be negative")]
    NegativeYieldError,
    #[msg("Draw Big Lottery First")]
    BigLotteryFirst,
    #[msg("Commit Big Lottery First")]
    BigLotteryCommitFirst,
    #[msg("Maximum Deposit per User has been reached")]
    MaxDepositReached,
    #[msg("Size account Error")]
    SizeConversionError,
}

// Helper function to select a winner based on the random value
fn select_winner(
    random_value: &[u8],
    offset: usize,
    intervals: &Vec<(Pubkey, u64)>,
    total_deposits: u64,
) -> Pubkey {
    // Convert the random_value slice starting at the offset into a single large integer
    let mut random_num = 0u128;
    for i in 0..random_value.len() {
        let byte = random_value[(offset + i) % random_value.len()];
        random_num = (random_num << 8) | byte as u128;
    }

    // Scale the large random number to the range [0, total_deposits)
    let random_point = (random_num % total_deposits as u128) as u64;
    msg!("Random point: {}", random_point);

    // Find the interval that contains the random point
    let mut previous_interval = 0u64;
    for (pubkey, interval) in intervals {
        msg!(
            "Checking interval: {} <= {} < {}",
            previous_interval,
            random_point,
            interval
        );
        if random_point < *interval {
            // Calculate the percentage chance for the winner
            let percentage = (*interval - previous_interval) as f64 / total_deposits as f64 * 100.0;
            msg!("Winner had a {:.2}% chance to win.", percentage);
            return *pubkey;
        }
        previous_interval = *interval;
    }

    // Fallback to last participant if not found (shouldn't happen)
    let winner = intervals.last().unwrap();
    let percentage = (winner.1 - previous_interval) as f64 / total_deposits as f64 * 100.0;
    msg!("Winner had a {:.2}% chance to win.", percentage);
    winner.0
}

fn transfer<'a>(
    source_acc: &AccountInfo<'a>,
    destination_acc: &AccountInfo<'a>,
    system_program_acc: &AccountInfo<'a>,
    amount: u64,
) -> ProgramResult {
    let transfer_instruction =
        solana_program::system_instruction::transfer(source_acc.key, destination_acc.key, amount);

    solana_program::program::invoke(
        &transfer_instruction,
        &[
            source_acc.clone(),
            destination_acc.clone(),
            system_program_acc.clone(),
        ],
    )
}

fn fetch_price(
    oracle_account: &PriceUpdateV2,
    is_sol: bool,
    time_limit_seconds: u64,
) -> Result<i64> {
    let feed_id_str = get_oracle_address(is_sol)?;

    let feed_id: [u8; 32] = get_feed_id_from_hex(feed_id_str)?;

    let final_price_result =
        oracle_account.get_price_no_older_than(&Clock::get()?, time_limit_seconds, &feed_id);

    match final_price_result {
        Ok(price_data) => Ok(price_data.price),
        Err(err) => {
            msg!("Error fetching price: {:?}", err);
            Err(CustomError::StalePrice.into())
        }
    }
}

fn get_oracle_address(is_sol: bool) -> Result<&'static str> {
    if is_sol == true {
        Ok(ORACLE_SOL)
    } else if is_sol == false {
        Ok(ORACLE_INF)
    } else {
        Err(CustomError::InvalidOracle.into())
    }
}

fn pricemath_sqrt_price_x64_to_inverted_price(sqrt_price_x64: u128) -> Result<i64> {
    msg!("sqrt_price_x64: {}", sqrt_price_x64);

    let sqrt_price_scaled = sqrt_price_x64
        .checked_mul(SCALE_SQRT)
        .ok_or(CustomError::ArithmeticError)?;
    // Convert sqrt_price_x64 to a u64 by scaling down using division
    let scaled_sqrt_price = (sqrt_price_scaled / (1u128 << 64)) as u64;
    msg!("scaled_sqrt_price: {}", scaled_sqrt_price);

    // Square the scaled value to get the price in u64
    let price_u64 = scaled_sqrt_price
        .checked_mul(scaled_sqrt_price)
        .ok_or(CustomError::ArithmeticError)?;

    msg!("price_u64: {}", price_u64);

    let large_number: u128 = 10_000_000_000_000_000_000_000; // 1E+22
    let price_u128 = price_u64 as u128;

    // Perform the division safely
    let result_u128 = large_number
        .checked_div(price_u128)
        .ok_or(CustomError::ArithmeticError)?; // CustomError needs to be defined

    // Check if the result can fit into u64
    if result_u128 > i64::MAX as u128 {
        return err!(CustomError::InvalidArguments); // CustomError needs to be defined
    }

    let result_u64 = result_u128 as i64;

    msg!("Inversed_Price: {}", result_u64);

    Ok(result_u64)
}
