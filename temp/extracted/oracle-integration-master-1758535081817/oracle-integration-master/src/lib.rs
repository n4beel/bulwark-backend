use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("66666666666666666666666666666666");

#[program]
pub mod oracle_integration {
    use super::*;

    pub fn initialize_price_feed(
        ctx: Context<InitializePriceFeed>,
        pyth_price_account: Pubkey,
        switchboard_feed: Pubkey,
    ) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.authority = ctx.accounts.authority.key();
        price_feed.pyth_price_account = pyth_price_account;
        price_feed.switchboard_feed = switchboard_feed;
        price_feed.last_updated = 0;
        price_feed.price = 0;
        price_feed.confidence = 0;
        price_feed.exponent = 0;
        price_feed.is_valid = false;
        Ok(())
    }

    pub fn update_price_from_pyth(ctx: Context<UpdatePriceFromPyth>) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        
        // In a real implementation, you would parse the Pyth price account data
        // For this example, we'll simulate price data
        let current_time = Clock::get()?.unix_timestamp;
        
        // Simulate price update (in real implementation, parse from Pyth account)
        price_feed.price = 50000000; // $50.00 with 6 decimals
        price_feed.confidence = 1000000; // $0.01 confidence
        price_feed.exponent = -6;
        price_feed.last_updated = current_time;
        price_feed.is_valid = true;

        emit!(PriceUpdated {
            price: price_feed.price,
            confidence: price_feed.confidence,
            timestamp: current_time,
        });

        Ok(())
    }

    pub fn update_price_from_switchboard(ctx: Context<UpdatePriceFromSwitchboard>) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        
        // In a real implementation, you would parse the Switchboard feed data
        let current_time = Clock::get()?.unix_timestamp;
        
        // Simulate price update (in real implementation, parse from Switchboard account)
        price_feed.price = 50100000; // $50.10 with 6 decimals
        price_feed.confidence = 500000; // $0.005 confidence
        price_feed.exponent = -6;
        price_feed.last_updated = current_time;
        price_feed.is_valid = true;

        emit!(PriceUpdated {
            price: price_feed.price,
            confidence: price_feed.confidence,
            timestamp: current_time,
        });

        Ok(())
    }

    pub fn create_lending_position(
        ctx: Context<CreateLendingPosition>,
        collateral_amount: u64,
        borrow_amount: u64,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let price_feed = &ctx.accounts.price_feed;
        
        // Validate price feed is recent (within 5 minutes)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time - price_feed.last_updated < 300,
            ErrorCode::StalePrice
        );
        require!(price_feed.is_valid, ErrorCode::InvalidPrice);

        // Calculate collateral value in USD
        let collateral_value_usd = (collateral_amount as u128)
            .checked_mul(price_feed.price as u128)
            .unwrap()
            .checked_div(10_u128.pow(price_feed.exponent.abs() as u32))
            .unwrap();

        // Calculate borrow value in USD
        let borrow_value_usd = (borrow_amount as u128)
            .checked_mul(price_feed.price as u128)
            .unwrap()
            .checked_div(10_u128.pow(price_feed.exponent.abs() as u32))
            .unwrap();

        // Check collateralization ratio (minimum 150%)
        let collateralization_ratio = (collateral_value_usd * 100)
            .checked_div(borrow_value_usd)
            .unwrap();
        
        require!(collateralization_ratio >= 150, ErrorCode::InsufficientCollateral);

        position.borrower = ctx.accounts.borrower.key();
        position.collateral_amount = collateral_amount;
        position.borrow_amount = borrow_amount;
        position.collateralization_ratio = collateralization_ratio as u16;
        position.created_at = current_time;
        position.is_active = true;

        // Transfer collateral to vault
        transfer_tokens_to_vault(
            &ctx.accounts.collateral_vault,
            &ctx.accounts.borrower_collateral_account,
            &ctx.accounts.borrower,
            &ctx.accounts.token_program,
            collateral_amount,
        )?;

        // Transfer borrowed tokens to borrower
        transfer_tokens_from_vault(
            &ctx.accounts.liquidity_vault,
            &ctx.accounts.borrower_token_account,
            &ctx.accounts.lending_pool,
            &ctx.accounts.token_program,
            borrow_amount,
        )?;

        Ok(())
    }

    pub fn liquidate_position(
        ctx: Context<LiquidatePosition>,
        liquidate_amount: u64,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let price_feed = &ctx.accounts.price_feed;
        
        require!(position.is_active, ErrorCode::PositionNotActive);
        
        // Validate price feed is recent
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time - price_feed.last_updated < 300,
            ErrorCode::StalePrice
        );

        // Recalculate collateralization ratio
        let collateral_value_usd = (position.collateral_amount as u128)
            .checked_mul(price_feed.price as u128)
            .unwrap()
            .checked_div(10_u128.pow(price_feed.exponent.abs() as u32))
            .unwrap();

        let remaining_debt = position.borrow_amount.checked_sub(liquidate_amount).unwrap();
        let remaining_debt_value_usd = (remaining_debt as u128)
            .checked_mul(price_feed.price as u128)
            .unwrap()
            .checked_div(10_u128.pow(price_feed.exponent.abs() as u32))
            .unwrap();

        let new_collateralization_ratio = if remaining_debt_value_usd > 0 {
            (collateral_value_usd * 100).checked_div(remaining_debt_value_usd).unwrap()
        } else {
            u128::MAX
        };

        // Check if position is undercollateralized (below 120%)
        require!(new_collateralization_ratio < 120, ErrorCode::PositionNotLiquidatable);

        // Calculate liquidation bonus (5%)
        let liquidation_bonus = (liquidate_amount as u128)
            .checked_mul(105)
            .unwrap()
            .checked_div(100)
            .unwrap() as u64;

        // Transfer liquidated tokens to liquidator
        transfer_tokens_from_vault(
            &ctx.accounts.liquidity_vault,
            &ctx.accounts.liquidator_token_account,
            &ctx.accounts.lending_pool,
            &ctx.accounts.token_program,
            liquidate_amount,
        )?;

        // Transfer collateral to liquidator (with bonus)
        transfer_tokens_from_vault(
            &ctx.accounts.collateral_vault,
            &ctx.accounts.liquidator_collateral_account,
            &ctx.accounts.lending_pool,
            &ctx.accounts.token_program,
            liquidation_bonus,
        )?;

        // Update position
        position.borrow_amount = remaining_debt;
        position.collateral_amount = position.collateral_amount.checked_sub(liquidation_bonus).unwrap();
        position.collateralization_ratio = new_collateralization_ratio as u16;

        if position.borrow_amount == 0 {
            position.is_active = false;
        }

        emit!(PositionLiquidated {
            position: position.key(),
            liquidated_amount: liquidate_amount,
            collateral_seized: liquidation_bonus,
            new_collateralization_ratio: position.collateralization_ratio,
        });

        Ok(())
    }

    pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
        let lending_pool = &mut ctx.accounts.lending_pool;
        lending_pool.is_paused = true;
        
        emit!(EmergencyPaused {
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// Helper functions
fn transfer_tokens_to_vault(
    vault: &AccountInfo,
    user_account: &AccountInfo,
    authority: &Signer,
    token_program: &Program<Token>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: user_account.to_account_info(),
        to: vault.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;
    Ok(())
}

fn transfer_tokens_from_vault(
    vault: &AccountInfo,
    user_account: &AccountInfo,
    lending_pool: &Account<LendingPool>,
    token_program: &Program<Token>,
    amount: u64,
) -> Result<()> {
    let seeds = &[
        b"lending_pool",
        lending_pool.token_mint.as_ref(),
        &[lending_pool.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: vault.to_account_info(),
        to: user_account.to_account_info(),
        authority: lending_pool.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, amount)?;
    Ok(())
}

// Account structs
#[derive(Accounts)]
pub struct InitializePriceFeed<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 4 + 1 + 1
    )]
    pub price_feed: Account<'info, PriceFeed>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePriceFromPyth<'info> {
    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,
    /// CHECK: This is the Pyth price account
    pub pyth_price_account: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdatePriceFromSwitchboard<'info> {
    #[account(mut)]
    pub price_feed: Account<'info, PriceFeed>,
    /// CHECK: This is the Switchboard feed account
    pub switchboard_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CreateLendingPosition<'info> {
    #[account(
        init,
        payer = borrower,
        space = 8 + 32 + 8 + 8 + 2 + 8 + 1
    )]
    pub position: Account<'info, LendingPosition>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    pub price_feed: Account<'info, PriceFeed>,
    #[account(
        mut,
        seeds = [b"lending_pool", lending_pool.token_mint.as_ref()],
        bump
    )]
    pub lending_pool: Account<'info, LendingPool>,
    #[account(mut)]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub liquidity_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub borrower_collateral_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub borrower_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(mut)]
    pub position: Account<'info, LendingPosition>,
    pub price_feed: Account<'info, PriceFeed>,
    #[account(
        mut,
        seeds = [b"lending_pool", lending_pool.token_mint.as_ref()],
        bump
    )]
    pub lending_pool: Account<'info, LendingPool>,
    #[account(mut)]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub liquidity_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(mut)]
    pub liquidator_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub liquidator_collateral_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"lending_pool", lending_pool.token_mint.as_ref()],
        bump
    )]
    pub lending_pool: Account<'info, LendingPool>,
    pub authority: Signer<'info>,
}

// Account structures
#[account]
pub struct PriceFeed {
    pub authority: Pubkey,
    pub pyth_price_account: Pubkey,
    pub switchboard_feed: Pubkey,
    pub last_updated: i64,
    pub price: i64,
    pub confidence: u64,
    pub exponent: i32,
    pub is_valid: bool,
}

#[account]
pub struct LendingPosition {
    pub borrower: Pubkey,
    pub collateral_amount: u64,
    pub borrow_amount: u64,
    pub collateralization_ratio: u16,
    pub created_at: i64,
    pub is_active: bool,
}

#[account]
pub struct LendingPool {
    pub token_mint: Pubkey,
    pub authority: Pubkey,
    pub is_paused: bool,
    pub bump: u8,
}

// Events
#[event]
pub struct PriceUpdated {
    pub price: i64,
    pub confidence: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionLiquidated {
    pub position: Pubkey,
    pub liquidated_amount: u64,
    pub collateral_seized: u64,
    pub new_collateralization_ratio: u16,
}

#[event]
pub struct EmergencyPaused {
    pub timestamp: i64,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Price feed is stale")]
    StalePrice,
    #[msg("Invalid price data")]
    InvalidPrice,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Position is not active")]
    PositionNotActive,
    #[msg("Position is not liquidatable")]
    PositionNotLiquidatable,
    #[msg("Lending pool is paused")]
    LendingPoolPaused,
}
