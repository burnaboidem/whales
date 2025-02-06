use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    program::{invoke, invoke_signed},
};

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    
    let game_account = next_account_info(accounts_iter)?;
    let player1_account = next_account_info(accounts_iter)?;
    let player2_account = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    match instruction_data[0] {
        0 => { // Initialize game and collect entry fees
            msg!("Instruction: Initialize Game");
            
            // Verify game account ownership
            if game_account.owner != program_id {
                return Err(ProgramError::IncorrectProgramId);
            }

            // Transfer 0.1 SOL from each player to game account
            let transfer_amount = 100000000; // 0.1 SOL in lamports

            invoke(
                &system_instruction::transfer(
                    player1_account.key,
                    game_account.key,
                    transfer_amount,
                ),
                &[
                    player1_account.clone(),
                    game_account.clone(),
                    system_program.clone(),
                ],
            )?;

            invoke(
                &system_instruction::transfer(
                    player2_account.key,
                    game_account.key,
                    transfer_amount,
                ),
                &[
                    player2_account.clone(),
                    game_account.clone(),
                    system_program.clone(),
                ],
            )?;
        }
        1 => { // Payout to winner
            msg!("Instruction: Payout Winner");
            
            let winner_account = next_account_info(accounts_iter)?;
            let total_pot = 200000000; // 0.2 SOL (combined entry fees)

            invoke_signed(
                &system_instruction::transfer(
                    game_account.key,
                    winner_account.key,
                    total_pot,
                ),
                &[
                    game_account.clone(),
                    winner_account.clone(),
                    system_program.clone(),
                ],
                &[&[&game_account.key.to_bytes(), &[255]]], // PDA seeds
            )?;
        }
        _ => {
            msg!("Error: Invalid instruction");
            return Err(ProgramError::InvalidInstructionData);
        }
    }

    Ok(())
} 