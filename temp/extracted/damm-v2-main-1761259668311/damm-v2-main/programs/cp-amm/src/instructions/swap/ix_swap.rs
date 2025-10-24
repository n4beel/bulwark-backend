use crate::{
    activation_handler::ActivationHandler,
    const_pda, get_pool_access_validator,
    instruction::Swap as SwapInstruction,
    instruction::Swap2 as Swap2Instruction,
    params::swap::TradeDirection,
    process_swap_exact_in, process_swap_exact_out, process_swap_partial_fill,
    safe_math::SafeMath,
    state::{fee::FeeMode, Pool, SwapResult2},
    swap::{ProcessSwapParams, ProcessSwapResult},
    token::{transfer_from_pool, transfer_from_user},
    EvtSwap, EvtSwap2, PoolError,
};
use anchor_lang::solana_program::sysvar;
use anchor_lang::{
    prelude::*,
    solana_program::instruction::{
        get_processed_sibling_instruction, get_stack_height, Instruction,
    },
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use num_enum::{FromPrimitive, IntoPrimitive};

#[repr(u8)]
#[derive(
    Clone, Copy, Debug, PartialEq, IntoPrimitive, FromPrimitive, AnchorDeserialize, AnchorSerialize,
)]
pub enum SwapMode {
    #[num_enum(default)]
    ExactIn,
    PartialFill,
    ExactOut,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SwapParameters {
    pub amount_in: u64,
    pub minimum_amount_out: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct SwapParameters2 {
    /// When it's exact in, partial fill, this will be amount_in. When it's exact out, this will be amount_out
    pub amount_0: u64,
    /// When it's exact in, partial fill, this will be minimum_amount_out. When it's exact out, this will be maximum_amount_in
    pub amount_1: u64,
    /// Swap mode, refer [SwapMode]
    pub swap_mode: u8,
}

#[event_cpi]
#[derive(Accounts)]
pub struct SwapCtx<'info> {
    /// CHECK: pool authority
    #[account(
        address = const_pda::pool_authority::ID
    )]
    pub pool_authority: UncheckedAccount<'info>,

    /// Pool account
    #[account(mut, has_one = token_a_vault, has_one = token_b_vault)]
    pub pool: AccountLoader<'info, Pool>,

    /// The user token account for input token
    #[account(mut)]
    pub input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The user token account for output token
    #[account(mut)]
    pub output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for input token
    #[account(mut, token::token_program = token_a_program, token::mint = token_a_mint)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for output token
    #[account(mut, token::token_program = token_b_program, token::mint = token_b_mint)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of token a
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of token b
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The user performing the swap
    pub payer: Signer<'info>,

    /// Token a program
    pub token_a_program: Interface<'info, TokenInterface>,

    /// Token b program
    pub token_b_program: Interface<'info, TokenInterface>,

    /// referral token account
    #[account(mut)]
    pub referral_token_account: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
}

impl<'info> SwapCtx<'info> {
    /// Get the trading direction of the current swap. Eg: USDT -> USDC
    pub fn get_trade_direction(&self) -> TradeDirection {
        if self.input_token_account.mint == self.token_a_mint.key() {
            return TradeDirection::AtoB;
        }
        TradeDirection::BtoA
    }
}

pub fn handle_swap_wrapper(ctx: &Context<SwapCtx>, params: SwapParameters2) -> Result<()> {
    let SwapParameters2 {
        amount_0,
        amount_1,
        swap_mode,
        ..
    } = params;

    {
        let pool = ctx.accounts.pool.load()?;
        let access_validator = get_pool_access_validator(&pool)?;
        require!(
            access_validator.can_swap(&ctx.accounts.payer.key()),
            PoolError::PoolDisabled
        );
    }

    let swap_mode = SwapMode::try_from(swap_mode).map_err(|_| PoolError::InvalidInput)?;
    let trade_direction = ctx.accounts.get_trade_direction();

    let (
        token_in_mint,
        token_out_mint,
        input_vault_account,
        output_vault_account,
        input_program,
        output_program,
    ) = match trade_direction {
        TradeDirection::AtoB => (
            &ctx.accounts.token_a_mint,
            &ctx.accounts.token_b_mint,
            &ctx.accounts.token_a_vault,
            &ctx.accounts.token_b_vault,
            &ctx.accounts.token_a_program,
            &ctx.accounts.token_b_program,
        ),
        TradeDirection::BtoA => (
            &ctx.accounts.token_b_mint,
            &ctx.accounts.token_a_mint,
            &ctx.accounts.token_b_vault,
            &ctx.accounts.token_a_vault,
            &ctx.accounts.token_b_program,
            &ctx.accounts.token_a_program,
        ),
    };

    // redundant validation, but we can just keep it
    require!(amount_0 > 0, PoolError::AmountIsZero);

    let has_referral = ctx.accounts.referral_token_account.is_some();
    let mut pool = ctx.accounts.pool.load_mut()?;
    let current_point = ActivationHandler::get_current_point(pool.activation_type)?;

    // another validation to prevent snipers to craft multiple swap instructions in 1 tx
    // (if we dont do this, they are able to concat 16 swap instructions in 1 tx)
    if let Ok(rate_limiter) = pool.pool_fees.base_fee.get_fee_rate_limiter() {
        if rate_limiter.is_rate_limiter_applied(
            current_point,
            pool.activation_point,
            trade_direction,
        )? {
            validate_single_swap_instruction(&ctx.accounts.pool.key(), ctx.remaining_accounts)?;
        }
    }

    // update for dynamic fee reference
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    pool.update_pre_swap(current_timestamp)?;

    let fee_mode = FeeMode::get_fee_mode(pool.collect_fee_mode, trade_direction, has_referral)?;

    let process_swap_params = ProcessSwapParams {
        pool: &pool,
        token_in_mint,
        token_out_mint,
        amount_0,
        amount_1,
        fee_mode: &fee_mode,
        trade_direction,
        current_point,
    };

    let ProcessSwapResult {
        swap_in_parameters,
        swap_result,
        included_transfer_fee_amount_in,
        excluded_transfer_fee_amount_out,
        included_transfer_fee_amount_out,
    } = match swap_mode {
        SwapMode::ExactIn => process_swap_exact_in(process_swap_params),
        SwapMode::PartialFill => process_swap_partial_fill(process_swap_params),
        SwapMode::ExactOut => process_swap_exact_out(process_swap_params),
    }?;

    pool.apply_swap_result(&swap_result, &fee_mode, current_timestamp)?;

    let SwapResult2 {
        included_fee_input_amount,
        referral_fee,
        ..
    } = swap_result;

    // send to reserve
    transfer_from_user(
        &ctx.accounts.payer,
        token_in_mint,
        &ctx.accounts.input_token_account,
        input_vault_account,
        input_program,
        included_transfer_fee_amount_in,
    )?;

    // send to user
    transfer_from_pool(
        ctx.accounts.pool_authority.to_account_info(),
        token_out_mint,
        output_vault_account,
        &ctx.accounts.output_token_account,
        output_program,
        included_transfer_fee_amount_out,
    )?;

    // send to referral
    if has_referral {
        if fee_mode.fees_on_token_a {
            transfer_from_pool(
                ctx.accounts.pool_authority.to_account_info(),
                &ctx.accounts.token_a_mint,
                &ctx.accounts.token_a_vault,
                &ctx.accounts.referral_token_account.clone().unwrap(),
                &ctx.accounts.token_a_program,
                referral_fee,
            )?;
        } else {
            transfer_from_pool(
                ctx.accounts.pool_authority.to_account_info(),
                &ctx.accounts.token_b_mint,
                &ctx.accounts.token_b_vault,
                &ctx.accounts.referral_token_account.clone().unwrap(),
                &ctx.accounts.token_b_program,
                referral_fee,
            )?;
        }
    }

    let (reserve_a_amount, reserve_b_amount) = pool.get_reserves_amount()?;

    emit_cpi!(EvtSwap {
        pool: ctx.accounts.pool.key(),
        trade_direction: trade_direction.into(),
        has_referral,
        params: swap_in_parameters,
        swap_result: swap_result.into(),
        actual_amount_in: included_fee_input_amount,
        current_timestamp
    });

    emit_cpi!(EvtSwap2 {
        pool: ctx.accounts.pool.key(),
        trade_direction: trade_direction.into(),
        collect_fee_mode: pool.collect_fee_mode,
        has_referral,
        params,
        swap_result,
        current_timestamp,
        included_transfer_fee_amount_in,
        included_transfer_fee_amount_out,
        excluded_transfer_fee_amount_out,
        reserve_a_amount,
        reserve_b_amount
    });

    Ok(())
}

pub fn validate_single_swap_instruction<'c, 'info>(
    pool: &Pubkey,
    remaining_accounts: &'c [AccountInfo<'info>],
) -> Result<()> {
    let instruction_sysvar_account_info = remaining_accounts
        .get(0)
        .ok_or_else(|| PoolError::FailToValidateSingleSwapInstruction)?;

    // get current index of instruction
    let current_index =
        sysvar::instructions::load_current_index_checked(instruction_sysvar_account_info)?;
    let current_instruction = sysvar::instructions::load_instruction_at_checked(
        current_index.into(),
        instruction_sysvar_account_info,
    )?;

    if current_instruction.program_id != crate::ID {
        // check if current instruction is CPI
        // disable any stack height greater than 2
        if get_stack_height() > 2 {
            return Err(PoolError::FailToValidateSingleSwapInstruction.into());
        }
        // check for any sibling instruction
        let mut sibling_index = 0;
        while let Some(sibling_instruction) = get_processed_sibling_instruction(sibling_index) {
            if sibling_instruction.program_id == crate::ID {
                require!(
                    !is_instruction_include_pool_swap(&sibling_instruction, pool),
                    PoolError::FailToValidateSingleSwapInstruction
                );
            }
            sibling_index = sibling_index.safe_add(1)?;
        }
    }

    if current_index == 0 {
        // skip for first instruction
        return Ok(());
    }
    for i in 0..current_index {
        let instruction = sysvar::instructions::load_instruction_at_checked(
            i.into(),
            instruction_sysvar_account_info,
        )?;

        if instruction.program_id != crate::ID {
            // we treat any instruction including that pool address is other swap ix
            for i in 0..instruction.accounts.len() {
                if instruction.accounts[i].pubkey.eq(pool) {
                    msg!("Multiple swaps not allowed");
                    return Err(PoolError::FailToValidateSingleSwapInstruction.into());
                }
            }
        } else {
            require!(
                !is_instruction_include_pool_swap(&instruction, pool),
                PoolError::FailToValidateSingleSwapInstruction
            );
        }
    }

    Ok(())
}

fn is_instruction_include_pool_swap(instruction: &Instruction, pool: &Pubkey) -> bool {
    let instruction_discriminator = &instruction.data[..8];
    if instruction_discriminator.eq(SwapInstruction::DISCRIMINATOR)
        || instruction_discriminator.eq(Swap2Instruction::DISCRIMINATOR)
    {
        return instruction.accounts[1].pubkey.eq(pool);
    }
    false
}
