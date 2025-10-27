use anchor_lang::prelude::*;
// SPL Token (Classic)
use anchor_spl::token::{self, Mint as SplMint, Token, TokenAccount as SplTokenAccount, Transfer as SplTransfer};
// SPL Token 2022
use anchor_spl::token_2022::{self, Mint as SplMint2022, Token2022};
// Metaplex (using simplified types for example)
// In a real scenario, you'd import specific metaplex crates like mpl-token-metadata
mod mpl_token_metadata {
    use anchor_lang::prelude::*;
    #[derive(Clone)]
    pub struct Metadata; // Placeholder struct
    impl anchor_lang::AccountDeserialize for Metadata { /* ... */ # [inline(never)] fn try_deserialize(_buf: &mut &[u8]) -> anchor_lang::Result<Self> { Ok(Self{}) } # [inline(never)] fn try_deserialize_unchecked(_buf: &mut &[u8]) -> anchor_lang::Result<Self> { Ok(Self{}) } } impl anchor_lang::AccountSerialize for Metadata { # [inline(never)] fn try_serialize<W: std::io::Write>(&self, _writer: &mut W) -> anchor_lang::Result<()> { Ok(()) } } impl anchor_lang::Owner for Metadata { fn owner() -> Pubkey { mpl_token_metadata::ID } } #[cfg(feature = "anchor-debug")] impl anchor_lang::TypeName for Metadata { fn get_type_name() -> String { "Metadata".to_string() } } declare_id!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
}
use mpl_token_metadata::Metadata as NftMetadata; // Use alias

declare_id!("TEST666666666666666666666666666666666666666");

#[program]
pub mod multi_asset_test {
    use super::*;

    // Handler using SPL Token (Classic)
    pub fn process_spl_token(ctx: Context<ProcessSplToken>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SplTransfer {
                    from: ctx.accounts.from_account.to_account_info(),
                    to: ctx.accounts.to_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    // Handler using SPL Token 2022
    pub fn process_token_2022(ctx: Context<ProcessToken2022>, amount: u64) -> Result<()> {
        // Example CPI (assuming token_2022 has similar functions)
         token_2022::transfer(
             CpiContext::new(
                 ctx.accounts.token_2022_program.to_account_info(),
                 // Assuming a Transfer struct exists for token_2022
                 anchor_spl::token_2022::Transfer {
                    from: ctx.accounts.from_account.to_account_info(),
                    to: ctx.accounts.to_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                 }
             ),
             amount
         )?;
        Ok(())
    }

    // Handler using NFT Metadata (Metaplex)
    pub fn process_nft(ctx: Context<ProcessNft>) -> Result<()> {
        msg!("NFT Metadata Key: {}", ctx.accounts.nft_metadata.key());
        // Logic interacting with NFT metadata...
        Ok(())
    }

    // Handler using Custom Asset Type
    pub fn process_custom_asset(ctx: Context<ProcessCustomAsset>, value: u32) -> Result<()> {
        ctx.accounts.custom_asset_account.asset_type = CustomAssetType::TypeB;
        ctx.accounts.custom_asset_account.value = value;
        msg!("Processed custom asset");
        Ok(())
    }
}

// --- Account Structs ---

#[derive(Accounts)]
pub struct ProcessSplToken<'info> {
    // Uses SPL Token types
    pub from_mint: Account<'info, SplMint>,
    #[account(mut)]
    pub from_account: Account<'info, SplTokenAccount>,
    #[account(mut)]
    pub to_account: Account<'info, SplTokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>, // Indicates SPL Token usage
}

#[derive(Accounts)]
pub struct ProcessToken2022<'info> {
    // Uses SPL Token 2022 types
    pub mint: Account<'info, SplMint2022>, // Key indicator
    #[account(mut)]
    pub from_account: Account<'info, SplTokenAccount>, // Can reuse SplTokenAccount for basic ops
    #[account(mut)]
    pub to_account: Account<'info, SplTokenAccount>,
    pub authority: Signer<'info>,
    pub token_2022_program: Program<'info, Token2022>, // Indicates Token 2022 usage
}

#[derive(Accounts)]
pub struct ProcessNft<'info> {
    // Uses Metaplex types
    #[account(
        // constraint = nft_metadata.owner == &mpl_token_metadata::ID // Check owner
    )]
    pub nft_metadata: Account<'info, NftMetadata>, // Key indicator
    /// CHECK: Metaplex program ID (can also be detected via CPI)
    #[account(address = mpl_token_metadata::ID)]
    pub metadata_program: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ProcessCustomAsset<'info> {
    // Uses Custom Asset types
    #[account(init_if_needed, payer = user, space = 8 + 4 + 1)]
    pub custom_asset_account: Account<'info, MyCustomAsset>, // Key indicator
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}


// --- State & Custom Types ---

// Custom Asset Struct
#[account]
pub struct MyCustomAsset {
    pub value: u32,
    pub asset_type: CustomAssetType,
}

// Custom Asset Enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CustomAssetType {
    TypeA,
    TypeB,
    TypeC,
}

#[error_code]
pub enum Errors {
    #[msg("Dummy error")]
    DummyError,
}
