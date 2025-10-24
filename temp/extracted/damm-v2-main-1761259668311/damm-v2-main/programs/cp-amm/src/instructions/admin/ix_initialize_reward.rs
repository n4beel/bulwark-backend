use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    const_pda,
    constants::{
        seeds::REWARD_VAULT_PREFIX, MAX_REWARD_DURATION, MIN_REWARD_DURATION, NUM_REWARDS,
    },
    error::PoolError,
    event::EvtInitializeReward,
    state::Pool,
    token::{get_token_program_flags, is_supported_mint, is_token_badge_initialized},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(reward_index: u8)]
pub struct InitializeRewardCtx<'info> {
    /// CHECK: pool authority
    #[account(address = const_pda::pool_authority::ID)]
    pub pool_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub pool: AccountLoader<'info, Pool>,

    #[account(
        init,
        seeds = [REWARD_VAULT_PREFIX.as_ref(), pool.key().as_ref(), reward_index.to_le_bytes().as_ref()],
        bump,
        payer = payer,
        token::mint = reward_mint,
        token::authority = pool_authority
    )]
    pub reward_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub reward_mint: Box<InterfaceAccount<'info, Mint>>,

    pub signer: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeRewardCtx<'info> {
    fn validate(&self, reward_index: usize, reward_duration: u64) -> Result<()> {
        let pool = self.pool.load()?;

        require!(reward_index < NUM_REWARDS, PoolError::InvalidRewardIndex);

        require!(
            reward_duration >= MIN_REWARD_DURATION && reward_duration <= MAX_REWARD_DURATION,
            PoolError::InvalidRewardDuration
        );

        let reward_info = &pool.reward_infos[reward_index];
        require!(!reward_info.initialized(), PoolError::RewardInitialized);

        pool.validate_authority_to_edit_reward(reward_index, self.signer.key())?;

        Ok(())
    }
}

pub fn handle_initialize_reward<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeRewardCtx<'info>>,
    reward_index: u8,
    reward_duration: u64,
    funder: Pubkey,
) -> Result<()> {
    if !is_supported_mint(&ctx.accounts.reward_mint)? {
        require!(
            is_token_badge_initialized(
                ctx.accounts.reward_mint.key(),
                ctx.remaining_accounts
                    .get(0)
                    .ok_or(PoolError::InvalidTokenBadge)?
            )?,
            PoolError::InvalidTokenBadge
        );
    }

    let index: usize = reward_index
        .try_into()
        .map_err(|_| PoolError::TypeCastFailed)?;

    ctx.accounts.validate(index, reward_duration)?;

    let mut pool = ctx.accounts.pool.load_mut()?;
    let reward_info = &mut pool.reward_infos[index];

    reward_info.init_reward(
        ctx.accounts.reward_mint.key(),
        ctx.accounts.reward_vault.key(),
        funder,
        reward_duration,
        get_token_program_flags(&ctx.accounts.reward_mint).into(),
    );

    emit_cpi!(EvtInitializeReward {
        pool: ctx.accounts.pool.key(),
        reward_mint: ctx.accounts.reward_mint.key(),
        funder,
        creator: ctx.accounts.signer.key(),
        reward_duration,
        reward_index,
    });

    Ok(())
}
