// =============================================================================
// MODULE: types
// DESCRIPTION: Shared Types, Constants & Error Codes for Fruit Game
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// This module provides common constants, error codes, and helper functions
// used across all game modules. Following best practices for Move development.
// =============================================================================

module contract::types {
    
    // ========================= GAME CONSTANTS ================================
    
    /// Number of fruit drops required after initiating claim to harvest seeds
    const DROPS_REQUIRED_AFTER_CLAIM: u64 = 5;
    
    /// Maximum fruit level (Watermelon = 10)
    const MAX_FRUIT_LEVEL: u8 = 10;
    
    /// Default number of slots on initial land
    const DEFAULT_LAND_SLOTS: u64 = 6;
    
    /// Time in milliseconds for a planted fruit to grow (15 seconds)
    const GROW_TIME_MS: u64 = 15_000;
    
    /// Cost in seeds to upgrade a land (adds more slots)
    const LAND_UPGRADE_COST: u64 = 100;
    
    /// Number of slots added per land upgrade
    const SLOTS_PER_UPGRADE: u64 = 3;
    
    /// Cost in seeds to purchase a new land
    const NEW_LAND_COST: u64 = 500;
    
    /// Cost in seeds to expand inventory capacity
    const INVENTORY_UPGRADE_COST: u64 = 50;
    
    /// Default inventory capacity
    const DEFAULT_INVENTORY_CAPACITY: u64 = 50;
    
    /// Inventory capacity added per upgrade
    const INVENTORY_CAPACITY_PER_UPGRADE: u64 = 25;
    
    // ========================= FRUIT TYPES ===================================
    // Each fruit level corresponds to a fruit type in the merge game
    
    const CHERRY: u8 = 1;      // 🍒 Level 1
    const GRAPE: u8 = 2;       // 🍇 Level 2
    const ORANGE: u8 = 3;      // 🍊 Level 3
    const LEMON: u8 = 4;       // 🍋 Level 4
    const APPLE: u8 = 5;       // 🍎 Level 5
    const PEAR: u8 = 6;        // 🍐 Level 6
    const PEACH: u8 = 7;       // 🍑 Level 7
    const PINEAPPLE: u8 = 8;   // 🍍 Level 8
    const MELON: u8 = 9;       // 🍈 Level 9
    const WATERMELON: u8 = 10; // 🍉 Level 10

    // ========================= RARITY LEVELS =================================
    
    const COMMON: u8 = 1;      // Base rarity
    const UNCOMMON: u8 = 2;    // +25% bonus weight
    const RARE: u8 = 3;        // +50% bonus weight
    const EPIC: u8 = 4;        // +100% bonus weight
    const LEGENDARY: u8 = 5;   // +200% bonus weight

    // ========================= ERROR CODES ===================================
    // Error codes are grouped by module/functionality for easier debugging
    
    // Game errors (0-99)
    const EGameOver: u64 = 0;
    const ENotInClaimMode: u64 = 1;
    const EAlreadyInClaimMode: u64 = 2;
    const EDropsRemaining: u64 = 3;
    const EInvalidFruitLevel: u64 = 4;
    const EClaimCompleteCannotDrop: u64 = 5;
    
    // Seed/Currency errors (100-199)
    const EInsufficientSeeds: u64 = 100;
    const EInsufficientBalance: u64 = 101;
    const EInvalidSeedCount: u64 = 102;
    
    // Land errors (200-299)
    const ESlotOccupied: u64 = 200;
    const ESlotEmpty: u64 = 201;
    const EFruitNotReady: u64 = 202;
    const EInvalidSlot: u64 = 203;
    const ELandNotOwned: u64 = 204;
    const ENoActiveLand: u64 = 205;
    
    // Inventory errors (300-399)
    const EInventoryFull: u64 = 300;
    const EInvalidInventoryIndex: u64 = 301;
    
    // Player errors (400-499)
    const EPlayerAlreadyExists: u64 = 400;
    const EPlayerNotFound: u64 = 401;

    // ========================= CONSTANT GETTERS ==============================
    
    /// Get the number of drops required after claim to harvest
    public fun drops_required(): u64 { DROPS_REQUIRED_AFTER_CLAIM }
    
    /// Get maximum fruit level
    public fun max_fruit_level(): u8 { MAX_FRUIT_LEVEL }
    
    /// Get default number of land slots
    public fun default_land_slots(): u64 { DEFAULT_LAND_SLOTS }
    
    /// Get grow time in milliseconds
    public fun grow_time_ms(): u64 { GROW_TIME_MS }
    
    /// Get land upgrade cost in seeds
    public fun land_upgrade_cost(): u64 { LAND_UPGRADE_COST }
    
    /// Get slots added per upgrade
    public fun slots_per_upgrade(): u64 { SLOTS_PER_UPGRADE }
    
    /// Get cost for a new land in seeds
    public fun new_land_cost(): u64 { NEW_LAND_COST }
    
    /// Get inventory upgrade cost in seeds
    public fun inventory_upgrade_cost(): u64 { INVENTORY_UPGRADE_COST }
    
    /// Get default inventory capacity
    public fun default_inventory_capacity(): u64 { DEFAULT_INVENTORY_CAPACITY }
    
    /// Get inventory capacity added per upgrade
    public fun inventory_capacity_per_upgrade(): u64 { INVENTORY_CAPACITY_PER_UPGRADE }
    
    // ========================= ERROR GETTERS =================================
    
    // Game errors
    public fun err_game_over(): u64 { EGameOver }
    public fun err_not_in_claim_mode(): u64 { ENotInClaimMode }
    public fun err_already_in_claim_mode(): u64 { EAlreadyInClaimMode }
    public fun err_drops_remaining(): u64 { EDropsRemaining }
    public fun err_invalid_fruit_level(): u64 { EInvalidFruitLevel }
    public fun err_claim_complete_cannot_drop(): u64 { EClaimCompleteCannotDrop }
    
    // Seed/Currency errors
    public fun err_insufficient_seeds(): u64 { EInsufficientSeeds }
    public fun err_insufficient_balance(): u64 { EInsufficientBalance }
    public fun err_invalid_seed_count(): u64 { EInvalidSeedCount }
    
    // Land errors
    public fun err_slot_occupied(): u64 { ESlotOccupied }
    public fun err_slot_empty(): u64 { ESlotEmpty }
    public fun err_fruit_not_ready(): u64 { EFruitNotReady }
    public fun err_invalid_slot(): u64 { EInvalidSlot }
    public fun err_land_not_owned(): u64 { ELandNotOwned }
    public fun err_no_active_land(): u64 { ENoActiveLand }
    
    // Inventory errors
    public fun err_inventory_full(): u64 { EInventoryFull }
    public fun err_invalid_inventory_index(): u64 { EInvalidInventoryIndex }
    
    // Player errors
    public fun err_player_already_exists(): u64 { EPlayerAlreadyExists }
    public fun err_player_not_found(): u64 { EPlayerNotFound }

    // ========================= FRUIT LEVEL GETTERS ===========================
    
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

    // ========================= RARITY GETTERS ================================
    
    public fun common(): u8 { COMMON }
    public fun uncommon(): u8 { UNCOMMON }
    public fun rare(): u8 { RARE }
    public fun epic(): u8 { EPIC }
    public fun legendary(): u8 { LEGENDARY }

    // ========================= HELPER FUNCTIONS ==============================

    /// Calculate seeds earned from merging to a fruit level
    /// Seeds are the main currency - higher level fruits yield more seeds
    /// - Levels 1-3: 0 seeds (small fruits)
    /// - Levels 4-5: (level - 3) seeds = 1-2 seeds
    /// - Levels 6-7: (level - 2) seeds = 4-5 seeds
    /// - Levels 8-10: level seeds = 8-10 seeds
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

    /// Get fruit name index for display purposes
    public fun fruit_name_index(level: u8): u8 {
        level
    }
    
    /// Calculate rarity bonus multiplier (returns percentage, e.g., 100 = 1x, 150 = 1.5x)
    public fun rarity_multiplier(rarity: u8): u64 {
        if (rarity == COMMON) {
            100
        } else if (rarity == UNCOMMON) {
            125
        } else if (rarity == RARE) {
            150
        } else if (rarity == EPIC) {
            200
        } else {
            300 // Legendary
        }
    }
}
