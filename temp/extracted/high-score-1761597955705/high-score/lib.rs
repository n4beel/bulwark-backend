use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("TEST111111111111111111111111111111111111111");

#[program]
pub mod high_risk_contract {

    use super::*;

    /// FACTOR TRIGGER: CC, TSC, CPI, Arith, Input(Numeric)
    pub fn process_god_function(
        ctx: Context<GodStruct>,
        amount: u64,
        price: u128,
        fee_rate: u32,
    ) -> Result<()> {
        // --- ARITHMETIC FACTOR TRIGGER ---
        // High-risk math ops inside a handler
        let fee = amount
            .checked_mul(fee_rate as u64)
            .unwrap()
            .checked_div(1000)
            .unwrap();
        
        let mut total = amount.checked_add(fee).unwrap();

        if price > 0 {
            let remainder = total % price as u64;
            total += remainder;
        }

        // --- CODE COMPLEXITY (CC) TRIGGER ---
        // Deeply nested logic with loops and match
        for i in 0..5 {
            if total > 100 && fee > 10 {
                match i {
                    0 => msg!("Case 0"),
                    1 => {
                        if total > 1000 || fee > 50 {
                            total = total.checked_sub(1).unwrap();
                        }
                    }
                    _ => msg!("Other case"),
                }
            } else if total == 0 {
                return err!(Errors::ZeroAmount);
            }
        }

        // --- CPI FACTOR TRIGGER ---
        // 4 unique programs, all signed
        
        // 1. Token Program
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            total,
        )?;

        // 2. System Program
        anchor_lang::system_program::create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.user_authority.to_account_info(),
                    to: ctx.accounts.new_account.to_account_info(),
                },
            ),
            10_000_000,
            100,
            ctx.accounts.user_authority.key,
        )?;

        // 3. ATA Program
        anchor_spl::associated_token::create(CpiContext::new(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.user_authority.to_account_info(),
                associated_token: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        ))?;
        
        // 4. Native Invoke Signed
        let pda_signer_seeds = &[b"pda-seed".as_ref(), &[ctx.bumps.god_pda]];
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                ctx.accounts.god_pda.key,
                ctx.accounts.receiver.key,
                1_000_000,
            ),
            &[
                ctx.accounts.god_pda.to_account_info(),
                ctx.accounts.receiver.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[pda_signer_seeds],
        )?;

        Ok(())
    }

    /// FACTOR TRIGGER: AC(Manual Check), Modularity, Input(Numeric)
    pub fn process_manual_checks(ctx: Context<ManualCheckStruct>, amount: u64) -> Result<()> {
        // --- ACCESS CONTROL (AC) TRIGGER ---
        // Manual, non-Anchor validation check
        if ctx.accounts.user.key() != ctx.accounts.state.authority {
            return err!(Errors::InvalidAuthority);
        }
        
        ctx.accounts.state.amount += amount;
        Ok(())
    }

    /// FACTOR TRIGGER: AC(Close), PDA(Manual Bump), Modularity, Input(Numeric)
    pub fn close_account_handler(ctx: Context<CloseStruct>, _amount: u64) -> Result<()> {
        // Logic to close the 'state' account is handled by Anchor
        // via the #[account(close = ...)] constraint.
        // This handler just needs to exist to be called.
        msg!("Closing account");
        Ok(())
    }

    /// FACTOR TRIGGER: Modularity, Input(Numeric)
    pub fn other_handler_1(ctx: Context<OtherStruct1>, amount: u64) -> Result<()> {
        Ok(())
    }

    /// FACTOR TRIGGER: Modularity, Input(Numeric)
    pub fn other_handler_2(ctx: Context<OtherStruct2>, amount: u64) -> Result<()> {
        Ok(())
    }
    
    /// FACTOR TRIGGER: Modularity, Input(Numeric)
    pub fn other_handler_3(ctx: Context<OtherStruct3>, amount: u64) -> Result<()> {
        Ok(())
    }

    // --- HELPER FUNCTION ---
    // Triggers Function Count and avg. CC
    fn _private_helper(a: u64, b: u64) -> u64 {
        if a > b && b != 0 {
            (a * b) / (a - b)
        } else {
            a + b
        }
    }
}

// --- ACCOUNT STRUCTS ---

/// FACTOR TRIGGER: Input(Width), Input(Constraints), PDA
#[derive(Accounts)]
pub struct GodStruct<'info> {
    // 10 accounts = High `max_accounts_len`
    
    // --- `total_constraints` trigger ---
    #[account(mut, has_one = mint)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(signer, constraint = user_authority.lamports() > 1_000_000)]
    pub user_authority: Signer<'info>,
    
    #[account(
        init_if_needed, 
        payer = user_authority, 
        seeds = [b"pda-seed"], 
        bump,
        space = 8 + 8
    )]
    pub god_pda: Account<'info, MyState>,
    
    #[account(
        seeds = [b"pda-seed-2", user_authority.key().as_ref()], 
        bump
    )]
    pub another_pda: Account<'info, MyState>,

    #[account(token::mint = mint, token::authority = user_authority)]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub new_account: SystemAccount<'info>,
    
    pub mint: Account<'info, Mint>,

    /// CHECK: A raw account for CPI
    pub receiver: AccountInfo<'info>,

    // --- Program accounts for CPI ---
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// FACTOR TRIGGER: PDA(Dynamic Seed)
#[derive(Accounts)]
pub struct ManualCheckStruct<'info> {
    #[account(mut)]
    pub state: Account<'info, MyState>,
    pub user: Signer<'info>,
}

/// FACTOR TRIGGER: AC(Close), PDA(Manual Bump)
#[derive(Accounts)]
pub struct CloseStruct<'info> {
    #[account(
        mut,
        close = receiver,
        seeds = [b"closeable", receiver.key().as_ref()],
        bump = state.bump
    )]
    pub state: Account<'info, CloseableState>,
    
    /// CHECK: Receiver for closed funds
    #[account(mut)]
    pub receiver: AccountInfo<'info>,
}

// --- Other structs to boost handler count ---

#[derive(Accounts)]
pub struct OtherStruct1<'info> {
    #[account(seeds = [b"other1"], bump)]
    pub pda: Account<'info, MyState>,
}

#[derive(Accounts)]
pub struct OtherStruct2<'info> {
    #[account(seeds = [b"other2"], bump)]
    pub pda: Account<'info, MyState>,
}

#[derive(Accounts)]
pub struct OtherStruct3<'info> {
    #[account(seeds = [b"other3"], bump)]
    pub pda: Account<'info, MyState>,
}

// --- STATE STRUCTS ---

#[account]
pub struct MyState {
    pub amount: u64,
    pub authority: Pubkey,
}

#[account]
pub struct CloseableState {
    pub data: u64,
    pub bump: u8,
}

#[error_code]
pub enum Errors {
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Amount cannot be zero")]
    ZeroAmount,
}
