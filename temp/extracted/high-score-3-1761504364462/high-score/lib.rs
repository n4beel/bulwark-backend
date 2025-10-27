use anchor_lang::prelude::*;

declare_id!("TEST444444444444444444444444444444444444444");

#[program]
pub mod high_dos_risk {
    use super::*;

    // --- Vec Param Handlers (Weight: 10x each) ---
    // We need 5+ of these to contribute significantly to the 100 cap

    pub fn process_vec_1(ctx: Context<ProcessData>, _data: Vec<u64>) -> Result<()> {
        msg!("Processing vector 1");
        // Potential CU exhaustion if vector is large
        Ok(())
    }

    pub fn process_vec_2(ctx: Context<ProcessData>, _items: Vec<String>) -> Result<()> {
        msg!("Processing vector 2");
        Ok(())
    }

    pub fn process_slice_1(ctx: Context<ProcessData>, _slice: &[u8]) -> Result<()> {
        msg!("Processing slice 1");
        Ok(())
    }
    
    pub fn process_slice_2(ctx: Context<ProcessData>, _other_data: &[Pubkey]) -> Result<()> {
        msg!("Processing slice 2");
        Ok(())
    }

    pub fn process_vec_and_loop(ctx: Context<ProcessData>, items: Vec<u64>) -> Result<()> {
        msg!("Processing vector with a loop");
        // --- Loop Handler Trigger (Weight: 5x) ---
        // Also triggers vec param handler (10x)
        let mut sum = 0u64;
        for item in items.iter() {
            sum = sum.checked_add(*item).ok_or(Errors::Overflow)?;
            // Expensive op inside loop could amplify CU cost
            require!(sum < u64::MAX / 2, Errors::Overflow);
        }
        ctx.accounts.data_account.data = sum;
        Ok(())
    }

    // --- Loop Handlers (Weight: 5x each) ---
    // We need 10+ handlers with loops to contribute significantly

    pub fn loop_handler_1(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in 0..100 { /* Simulate work */ }
        Ok(())
    }
    pub fn loop_handler_2(ctx: Context<SimpleContext>) -> Result<()> {
        let mut i = 0;
        while i < 50 { i += 1; /* Simulate work */ }
        Ok(())
    }
    pub fn loop_handler_3(ctx: Context<SimpleContext>) -> Result<()> {
        loop { /* Simulate work */ break; }
        Ok(())
    }
    pub fn loop_handler_4(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in (0..10).rev() { /* Simulate work */ }
        Ok(())
    }
     pub fn loop_handler_5(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in 0..10 { /* Simulate work */ }
        Ok(())
    }
     pub fn loop_handler_6(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in 0..10 { /* Simulate work */ }
        Ok(())
    }
     pub fn loop_handler_7(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in 0..10 { /* Simulate work */ }
        Ok(())
    }
     pub fn loop_handler_8(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in 0..10 { /* Simulate work */ }
        Ok(())
    }
     pub fn loop_handler_9(ctx: Context<SimpleContext>) -> Result<()> {
        for _ in 0..10 { /* Simulate work */ }
        Ok(())
    }
    // Note: process_vec_and_loop also counts as a loop handler


    // --- Handler with No Triggers ---
    pub fn simple_safe_handler(ctx: Context<SimpleContext>) -> Result<()> {
        msg!("This handler has no Vec/Slice params or loops.");
        Ok(())
    }
}

// --- Account Structs ---

#[derive(Accounts)]
pub struct ProcessData<'info> {
    #[account(mut)]
    pub data_account: Account<'info, DataAccount>,
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SimpleContext<'info> {
    pub user: Signer<'info>,
}

// --- Dynamic Space Triggers (Weight: 2x each) ---
// We need 5+ of these to contribute significantly

#[derive(Accounts)]
pub struct DynamicSpace1<'info> {
    #[account(init, payer = user, space = 8 + calculate_space())] // Function call = dynamic
    pub data: Account<'info, DataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DynamicSpace2<'info> {
    #[account(init, payer = user, space = 8 + SomeData::MAX_SIZE)] // Constant reference = dynamic (path)
    pub data: Account<'info, DataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DynamicSpace3<'info> {
    #[account(init, payer = user, space = 8 + user.lamports() as usize)] // Accessing account data = dynamic
    pub data: Account<'info, DataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DynamicSpace4<'info> {
    // Math involving non-literals is treated as dynamic
    #[account(init, payer = user, space = 8 + 32 * get_multiplier())] 
    pub data: Account<'info, DataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DynamicSpace5<'info> {
     // Even simple path is dynamic
    #[account(init, payer = user, space = MY_CONST_SPACE)]
    pub data: Account<'info, DataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}


// --- Constant Space (for max_constant_space metric) ---

#[derive(Accounts)]
pub struct ConstantSpaceLarge<'info> {
    #[account(init, payer = user, space = 8 + 10240)] // 10KB constant
    pub large_data: Account<'info, LargeDataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConstantSpaceSmall<'info> {
     #[account(init, payer = user, space = 64)] // Small constant
    pub small_data: Account<'info, SmallDataAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// --- State Structs ---

#[account]
pub struct DataAccount {
    pub data: u64,
}

#[account]
pub struct LargeDataAccount {
    pub large_buffer: [u8; 10240], // Matches space
}
#[account]
pub struct SmallDataAccount {
     pub buffer: [u8; 56], // Matches space (64-8)
}

// --- Helper Constants/Functions (for dynamic space examples) ---

const MY_CONST_SPACE: usize = 256;

fn calculate_space() -> usize { 128 }
fn get_multiplier() -> usize { 4 }

pub mod SomeData {
   pub const MAX_SIZE: usize = 512;
}


#[error_code]
pub enum Errors {
    #[msg("Overflow")]
    Overflow,
}
