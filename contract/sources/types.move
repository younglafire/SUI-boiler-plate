// Shared Types & Constants for Fruit Game
// SPDX-License-Identifier: Apache-2.0

module contract::types {
    // ============ CONSTANTS ============
    const DROPS_REQUIRED_AFTER_CLAIM: u64 = 5;
    const MAX_FRUIT_LEVEL: u8 = 10;
    
    // Fruit types (levels) - exported for other modules
    const CHERRY: u8 = 1;      // 🍒
    const GRAPE: u8 = 2;       // 🍇
    const ORANGE: u8 = 3;      // 🍊
    const LEMON: u8 = 4;       // 🍋
    const APPLE: u8 = 5;       // 🍎
    const PEAR: u8 = 6;        // 🍐
    const PEACH: u8 = 7;       // 🍑
    const PINEAPPLE: u8 = 8;   // 🍍
    const MELON: u8 = 9;       // 🍈
    const WATERMELON: u8 = 10; // 🍉

    // Rarity levels
    const COMMON: u8 = 1;
    const UNCOMMON: u8 = 2;
    const RARE: u8 = 3;
    const EPIC: u8 = 4;
    const LEGENDARY: u8 = 5;

    // ============ ERRORS ============
    const EGameOver: u64 = 0;
    const ENotInClaimMode: u64 = 1;
    const EAlreadyInClaimMode: u64 = 2;
    const EDropsRemaining: u64 = 3;
    const EInvalidFruitLevel: u64 = 4;
    const EInsufficientSeeds: u64 = 5;
    const EInsufficientBalance: u64 = 6;
    const EInvalidSeedCount: u64 = 7;

    // ============ GETTER FUNCTIONS ============
    
    public fun drops_required(): u64 { DROPS_REQUIRED_AFTER_CLAIM }
    public fun max_fruit_level(): u8 { MAX_FRUIT_LEVEL }
    
    // Errors
    public fun err_game_over(): u64 { EGameOver }
    public fun err_not_in_claim_mode(): u64 { ENotInClaimMode }
    public fun err_already_in_claim_mode(): u64 { EAlreadyInClaimMode }
    public fun err_drops_remaining(): u64 { EDropsRemaining }
    public fun err_invalid_fruit_level(): u64 { EInvalidFruitLevel }
    public fun err_insufficient_seeds(): u64 { EInsufficientSeeds }
    public fun err_insufficient_balance(): u64 { EInsufficientBalance }
    public fun err_invalid_seed_count(): u64 { EInvalidSeedCount }

    // Fruit levels
    public fun cherry(): u8 { CHERRY }
    public fun grape(): u8 { GRAPE }
    public fun orange(): u8 { ORANGE }
    public fun lemon(): u8 { LEMON }
    public fun apple(): u8 { APPLE }
    public fun pear(): u8 { PEAR }
    public fun peach(): u8 { PEACH }
    public fun pineapple(): u8 { PINEAPPLE }
    public fun melon(): u8 { MELON }
    public fun watermelon(): u8 { WATERMELON }

    // Rarities
    public fun common(): u8 { COMMON }
    public fun uncommon(): u8 { UNCOMMON }
    public fun rare(): u8 { RARE }
    public fun epic(): u8 { EPIC }
    public fun legendary(): u8 { LEGENDARY }

    // ============ HELPER FUNCTIONS ============

    /// Calculate seeds earned from merging to a fruit level
    public fun calculate_seeds(fruit_level: u8): u64 {
        if (fruit_level <= 3) {
            0 // Small fruits give no seeds
        } else if (fruit_level <= 5) {
            (fruit_level as u64) - 3 // 1-2 seeds
        } else if (fruit_level <= 7) {
            (fruit_level as u64) - 2 // 4-5 seeds
        } else {
            (fruit_level as u64) // 8-10 seeds
        }
    }

    /// Get fruit name for display (returns index)
    public fun fruit_name_index(level: u8): u8 {
        level
    }
}
