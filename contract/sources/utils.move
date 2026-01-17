// ============================================================================
// Module: utils
// Description: Utility functions, constants, and error codes for Fruit Game
// This module provides the foundation for the entire game system
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::utils {
    use std::string;
    use sui::clock::Clock;

    // ============================================================================
    // ERROR CODES
    // ============================================================================
    
    // Game Errors (100-199)
    const E_GAME_OVER: u64 = 100;
    const E_NOT_IN_CLAIM_MODE: u64 = 101;
    const E_ALREADY_IN_CLAIM_MODE: u64 = 102;
    const E_DROPS_REMAINING: u64 = 103;
    const E_NO_DROPS_REMAINING: u64 = 104;
    const E_INVALID_FRUIT_LEVEL: u64 = 105;
    const E_CLAIMING_MUST_DROP: u64 = 106;
    const E_INSUFFICIENT_FRUITS: u64 = 107;
    
    // Seed/Balance Errors (200-299)
    const E_INSUFFICIENT_SEEDS: u64 = 200;
    const E_INSUFFICIENT_BALANCE: u64 = 201;
    const E_INVALID_SEED_COUNT: u64 = 202;
    
    // Land Errors (300-399)
    const E_SLOT_OCCUPIED: u64 = 300;
    const E_SLOT_EMPTY: u64 = 301;
    const E_FRUIT_NOT_READY: u64 = 302;
    const E_INVALID_SLOT: u64 = 303;
    const E_LAND_NOT_FOUND: u64 = 304;
    const E_MAX_LANDS_REACHED: u64 = 305;
    const E_LAND_MAX_LEVEL: u64 = 306;
    
    // Player Errors (400-499)
    const E_PLAYER_ALREADY_EXISTS: u64 = 400;
    const E_NOT_OWNER: u64 = 401;
    const E_INVENTORY_FULL: u64 = 402;
    const E_INVENTORY_EMPTY: u64 = 403;
    const E_INVALID_LAND_INDEX: u64 = 404;

    // ============================================================================
    // GAME CONSTANTS
    // ============================================================================
    
    // Core Game Mechanics
    const DROPS_REQUIRED_AFTER_CLAIM: u64 = 5;
    const MAX_FRUIT_LEVEL: u8 = 10;
    const INITIAL_DROPS_PER_GAME: u64 = 100;
    
    // SEED coin has 9 decimals - all costs must be multiplied by this
    const SEED_DECIMALS: u64 = 1_000_000_000;
    
    // Land System
    const INITIAL_LAND_SLOTS: u64 = 6;
    const MAX_LAND_SLOTS: u64 = 12;
    const MAX_LANDS_PER_PLAYER: u64 = 5;
    const LAND_UPGRADE_COST_BASE: u64 = 100 * 1_000_000_000;     // 100 SEED to upgrade land (with decimals)
    const NEW_LAND_COST: u64 = 500 * 1_000_000_000;              // 500 SEED to buy new land (with decimals)
    
    // Grow times based on rarity (in milliseconds)
    const GROW_TIME_COMMON: u64 = 15_000;        // 15 seconds for Common
    const GROW_TIME_UNCOMMON: u64 = 30_000;      // 30 seconds for Uncommon
    const GROW_TIME_RARE: u64 = 60_000;          // 1 minute for Rare
    const GROW_TIME_EPIC: u64 = 120_000;         // 2 minutes for Epic
    const GROW_TIME_LEGENDARY: u64 = 300_000;    // 5 minutes for Legendary
    
    // Shop item prices (in SEED with decimals)
    const WATERING_CAN_COST: u64 = 50 * 1_000_000_000;   // 50 SEED
    const FERTILIZER_COST: u64 = 100 * 1_000_000_000;    // 100 SEED
    const SHOVEL_COST: u64 = 25 * 1_000_000_000;         // 25 SEED
    
    // Inventory System
    const INITIAL_INVENTORY_SLOTS: u64 = 20;
    const MAX_INVENTORY_SLOTS: u64 = 200;
    const INVENTORY_UPGRADE_COST: u64 = 200 * 1_000_000_000;     // 200 SEED base cost (with decimals)
    const INVENTORY_SLOTS_PER_UPGRADE: u64 = 10; // Slots gained per upgrade

    // ============================================================================
    // FRUIT TYPES (Levels 1-10)
    // ============================================================================
    
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

    // ============================================================================
    // FRUIT WEIGHT RANGES (in grams) - Based on real fruit weights
    // ============================================================================
    
    // Cherry: 5-15g (normal), >15g (rare), >25g (legendary)
    const CHERRY_BASE_MIN: u64 = 5;
    const CHERRY_BASE_MAX: u64 = 15;
    
    // Grape: 2-5g (normal), >5g (rare), >8g (legendary)
    const GRAPE_BASE_MIN: u64 = 2;
    const GRAPE_BASE_MAX: u64 = 5;
    
    // Orange: 130-200g (normal), >200g (rare), >300g (legendary)
    const ORANGE_BASE_MIN: u64 = 130;
    const ORANGE_BASE_MAX: u64 = 200;
    
    // Lemon: 60-100g (normal), >100g (rare), >150g (legendary)
    const LEMON_BASE_MIN: u64 = 60;
    const LEMON_BASE_MAX: u64 = 100;
    
    // Apple: 150-250g (normal), >250g (rare), >350g (legendary)
    const APPLE_BASE_MIN: u64 = 150;
    const APPLE_BASE_MAX: u64 = 250;
    
    // Pear: 180-280g (normal), >280g (rare), >400g (legendary)
    const PEAR_BASE_MIN: u64 = 180;
    const PEAR_BASE_MAX: u64 = 280;
    
    // Peach: 120-180g (normal), >180g (rare), >250g (legendary)
    const PEACH_BASE_MIN: u64 = 120;
    const PEACH_BASE_MAX: u64 = 180;
    
    // Pineapple: 900-1500g (normal), >1500g (rare), >2000g (legendary)
    const PINEAPPLE_BASE_MIN: u64 = 900;
    const PINEAPPLE_BASE_MAX: u64 = 1500;
    
    // Melon: 1000-2000g (normal), >2000g (rare), >3000g (legendary)
    const MELON_BASE_MIN: u64 = 1000;
    const MELON_BASE_MAX: u64 = 2000;
    
    // Watermelon: 3000-6000g (normal), >6000g (rare), >9000g (legendary)
    const WATERMELON_BASE_MIN: u64 = 3000;
    const WATERMELON_BASE_MAX: u64 = 6000;

    // ============================================================================
    // RARITY LEVELS
    // ============================================================================
    
    const RARITY_COMMON: u8 = 1;      // Normal weight range
    const RARITY_UNCOMMON: u8 = 2;    // Slightly above normal
    const RARITY_RARE: u8 = 3;        // Significantly above normal
    const RARITY_EPIC: u8 = 4;        // Very heavy for the fruit type
    const RARITY_LEGENDARY: u8 = 5;   // Exceptionally heavy

    // Rarity thresholds (out of 100)
    const RARITY_THRESHOLD_UNCOMMON: u64 = 50;
    const RARITY_THRESHOLD_RARE: u64 = 75;
    const RARITY_THRESHOLD_EPIC: u64 = 90;
    const RARITY_THRESHOLD_LEGENDARY: u64 = 98;

    // ============================================================================
    // ERROR GETTERS
    // ============================================================================
    
    public fun e_game_over(): u64 { E_GAME_OVER }
    public fun e_not_in_claim_mode(): u64 { E_NOT_IN_CLAIM_MODE }
    public fun e_already_in_claim_mode(): u64 { E_ALREADY_IN_CLAIM_MODE }
    public fun e_drops_remaining(): u64 { E_DROPS_REMAINING }
    public fun e_no_drops_remaining(): u64 { E_NO_DROPS_REMAINING }
    public fun e_invalid_fruit_level(): u64 { E_INVALID_FRUIT_LEVEL }
    public fun e_claiming_must_drop(): u64 { E_CLAIMING_MUST_DROP }
    public fun e_insufficient_fruits(): u64 { E_INSUFFICIENT_FRUITS }
    public fun e_insufficient_seeds(): u64 { E_INSUFFICIENT_SEEDS }
    public fun e_insufficient_balance(): u64 { E_INSUFFICIENT_BALANCE }
    public fun e_invalid_seed_count(): u64 { E_INVALID_SEED_COUNT }
    public fun e_slot_occupied(): u64 { E_SLOT_OCCUPIED }
    public fun e_slot_empty(): u64 { E_SLOT_EMPTY }
    public fun e_fruit_not_ready(): u64 { E_FRUIT_NOT_READY }
    public fun e_invalid_slot(): u64 { E_INVALID_SLOT }
    public fun e_land_not_found(): u64 { E_LAND_NOT_FOUND }
    public fun e_max_lands_reached(): u64 { E_MAX_LANDS_REACHED }
    public fun e_land_max_level(): u64 { E_LAND_MAX_LEVEL }
    public fun e_player_already_exists(): u64 { E_PLAYER_ALREADY_EXISTS }
    public fun e_not_owner(): u64 { E_NOT_OWNER }
    public fun e_inventory_full(): u64 { E_INVENTORY_FULL }
    public fun e_inventory_empty(): u64 { E_INVENTORY_EMPTY }
    public fun e_invalid_land_index(): u64 { E_INVALID_LAND_INDEX }

    // ============================================================================
    // CONSTANT GETTERS
    // ============================================================================
    
    // Game Constants
    public fun drops_required(): u64 { DROPS_REQUIRED_AFTER_CLAIM }
    public fun max_fruit_level(): u8 { MAX_FRUIT_LEVEL }
    public fun initial_drops(): u64 { INITIAL_DROPS_PER_GAME }
    
    // Land Constants
    public fun initial_land_slots(): u64 { INITIAL_LAND_SLOTS }
    public fun max_land_slots(): u64 { MAX_LAND_SLOTS }
    public fun max_lands_per_player(): u64 { MAX_LANDS_PER_PLAYER }
    public fun land_upgrade_cost_base(): u64 { LAND_UPGRADE_COST_BASE }
    public fun new_land_cost(): u64 { NEW_LAND_COST }
    
    /// Get grow time based on rarity (rarer fruits take longer to grow)
    public fun get_grow_time_by_rarity(rarity: u8): u64 {
        if (rarity == RARITY_LEGENDARY) {
            GROW_TIME_LEGENDARY
        } else if (rarity == RARITY_EPIC) {
            GROW_TIME_EPIC
        } else if (rarity == RARITY_RARE) {
            GROW_TIME_RARE
        } else if (rarity == RARITY_UNCOMMON) {
            GROW_TIME_UNCOMMON
        } else {
            GROW_TIME_COMMON
        }
    }
    
    // Shop item costs
    public fun watering_can_cost(): u64 { WATERING_CAN_COST }
    public fun fertilizer_cost(): u64 { FERTILIZER_COST }
    public fun shovel_cost(): u64 { SHOVEL_COST }
    
    // Inventory Constants
    public fun initial_inventory_slots(): u64 { INITIAL_INVENTORY_SLOTS }
    public fun max_inventory_slots(): u64 { MAX_INVENTORY_SLOTS }
    public fun inventory_upgrade_cost(): u64 { INVENTORY_UPGRADE_COST }

    // ============================================================================
    // FRUIT TYPE GETTERS
    // ============================================================================
    
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

    // ============================================================================
    // RARITY GETTERS
    // ============================================================================
    
    public fun rarity_common(): u8 { RARITY_COMMON }
    public fun rarity_uncommon(): u8 { RARITY_UNCOMMON }
    public fun rarity_rare(): u8 { RARITY_RARE }
    public fun rarity_epic(): u8 { RARITY_EPIC }
    public fun rarity_legendary(): u8 { RARITY_LEGENDARY }

    // ============================================================================
    // CALCULATION FUNCTIONS
    // ============================================================================

    /// Calculate seeds earned from merging to a fruit level
    /// Higher level fruits = more seeds
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

    /// Get base weight range for a fruit type
    /// Returns (min_weight, max_weight) in grams
    public fun get_fruit_weight_range(fruit_type: u8): (u64, u64) {
        if (fruit_type == CHERRY) {
            (CHERRY_BASE_MIN, CHERRY_BASE_MAX)
        } else if (fruit_type == GRAPE) {
            (GRAPE_BASE_MIN, GRAPE_BASE_MAX)
        } else if (fruit_type == ORANGE) {
            (ORANGE_BASE_MIN, ORANGE_BASE_MAX)
        } else if (fruit_type == LEMON) {
            (LEMON_BASE_MIN, LEMON_BASE_MAX)
        } else if (fruit_type == APPLE) {
            (APPLE_BASE_MIN, APPLE_BASE_MAX)
        } else if (fruit_type == PEAR) {
            (PEAR_BASE_MIN, PEAR_BASE_MAX)
        } else if (fruit_type == PEACH) {
            (PEACH_BASE_MIN, PEACH_BASE_MAX)
        } else if (fruit_type == PINEAPPLE) {
            (PINEAPPLE_BASE_MIN, PINEAPPLE_BASE_MAX)
        } else if (fruit_type == MELON) {
            (MELON_BASE_MIN, MELON_BASE_MAX)
        } else if (fruit_type == WATERMELON) {
            (WATERMELON_BASE_MIN, WATERMELON_BASE_MAX)
        } else {
            // Default to apple range
            (APPLE_BASE_MIN, APPLE_BASE_MAX)
        }
    }

    /// Generate a random weight for a fruit type based on seeds planted
    /// More seeds = higher chance of heavier fruit
    public fun generate_fruit_weight(
        fruit_type: u8,
        seeds_planted: u64,
        random_value: u64
    ): u64 {
        let (base_min, base_max) = get_fruit_weight_range(fruit_type);
        let base_range = base_max - base_min;
        
        // Normalize seeds (seeds_planted comes with 9 decimals, so divide by SEED_DECIMALS)
        // This converts 1_000_000_000 (1 SEED) to 1
        let normalized_seeds = seeds_planted / SEED_DECIMALS;
        // Cap the seed bonus at 10 seeds for balance
        let capped_seeds = if (normalized_seeds > 10) { 10 } else { normalized_seeds };
        
        // Base random weight within normal range
        let random_offset = (random_value % base_range);
        let base_weight = base_min + random_offset;
        
        // Seeds can increase weight beyond normal range (but capped)
        // Each normalized seed adds up to 5% of base_range bonus
        let seed_bonus = (capped_seeds * base_range) / 20;
        
        // Small random bonus (0-20% of base_range for some variance)
        let extra_random = (random_value / 100) % (base_range / 5 + 1);
        
        base_weight + seed_bonus + extra_random
    }

    /// Calculate rarity based on weight relative to fruit type
    /// Bigger fruits are LESS impressive when heavy (watermelon vs cherry)
    public fun calculate_weight_based_rarity(fruit_type: u8, weight: u64): u8 {
        let (base_min, base_max) = get_fruit_weight_range(fruit_type);
        
        // Calculate how much the weight exceeds the normal range
        if (weight <= base_max) {
            // Within normal range = common
            RARITY_COMMON
        } else {
            // Calculate percentage over the normal max weight
            let excess = weight - base_max;
            let base_range = base_max - base_min;
            
            // For small fruits (cherry, grape), being heavy is more impressive
            // For large fruits (watermelon), you need to be MUCH heavier to be impressive
            let weight_threshold_multiplier = if (fruit_type <= GRAPE) {
                1  // Small fruits: 1x multiplier
            } else if (fruit_type <= LEMON) {
                2  // Medium-small fruits: 2x multiplier
            } else if (fruit_type <= PEACH) {
                3  // Medium fruits: 3x multiplier
            } else if (fruit_type <= PINEAPPLE) {
                5  // Large fruits: 5x multiplier
            } else {
                7  // Very large fruits: 7x multiplier
            };
            
            // Calculate rarity score (0-100+)
            let rarity_score = (excess * 100) / (base_range * weight_threshold_multiplier);
            
            if (rarity_score >= 200) {
                RARITY_LEGENDARY  // >200% over = legendary
            } else if (rarity_score >= 100) {
                RARITY_EPIC       // 100-200% over = epic
            } else if (rarity_score >= 50) {
                RARITY_RARE       // 50-100% over = rare
            } else if (rarity_score >= 20) {
                RARITY_UNCOMMON   // 20-50% over = uncommon
            } else {
                RARITY_COMMON     // <20% over = common
            }
        }
    }

    /// OLD: Calculate rarity based on roll and seeds invested
    /// DEPRECATED: Use calculate_weight_based_rarity instead
    /// Kept for backward compatibility
    public fun calculate_rarity(roll: u64, seeds_planted: u64): u8 {
        // Bonus from seeds: each 2 seeds = +1 to roll
        let bonus = seeds_planted / 2;
        let adjusted_roll = if (roll + bonus > 100) { 100 } else { roll + bonus };
        
        if (adjusted_roll <= RARITY_THRESHOLD_UNCOMMON) {
            RARITY_COMMON
        } else if (adjusted_roll <= RARITY_THRESHOLD_RARE) {
            RARITY_UNCOMMON
        } else if (adjusted_roll <= RARITY_THRESHOLD_EPIC) {
            RARITY_RARE
        } else if (adjusted_roll <= RARITY_THRESHOLD_LEGENDARY) {
            RARITY_EPIC
        } else {
            RARITY_LEGENDARY
        }
    }

    /// Calculate land upgrade cost based on current level
    /// Cost doubles with each level
    public fun calculate_land_upgrade_cost(current_level: u64): u64 {
        LAND_UPGRADE_COST_BASE * (1 << (current_level as u8)) // 100, 200, 400, 800...
    }

    /// Calculate inventory upgrade cost (progressive - gets more expensive)
    public fun calculate_inventory_upgrade_cost(current_slots: u64): u64 {
        let upgrades = (current_slots - INITIAL_INVENTORY_SLOTS) / INVENTORY_SLOTS_PER_UPGRADE;
        // Base cost * (1 + upgrade_level), so 200, 400, 600, 800...
        INVENTORY_UPGRADE_COST * (upgrades + 1)
    }
    
    /// Get slots added per inventory upgrade
    public fun inventory_slots_per_upgrade(): u64 { INVENTORY_SLOTS_PER_UPGRADE }

    /// Get current timestamp from clock
    public fun get_timestamp(clock: &Clock): u64 {
        sui::clock::timestamp_ms(clock)
    }

    /// Check if a fruit is ready to harvest based on rarity
    public fun is_fruit_ready(planted_at: u64, current_time: u64, rarity: u8): bool {
        let grow_time = get_grow_time_by_rarity(rarity);
        current_time >= planted_at + grow_time
    }
    
    /// Check if a fruit is ready with a speed boost applied
    public fun is_fruit_ready_with_boost(planted_at: u64, current_time: u64, rarity: u8, speed_boost_ms: u64): bool {
        let grow_time = get_grow_time_by_rarity(rarity);
        let effective_grow_time = if (speed_boost_ms >= grow_time) { 1000 } else { grow_time - speed_boost_ms };
        current_time >= planted_at + effective_grow_time
    }

    // ============================================================================
    // WALRUS BLOB IDS FOR FRUIT IMAGES
    // ============================================================================
    
    // Walrus aggregator base URL
    const WALRUS_AGGREGATOR_URL: vector<u8> = b"https://aggregator.walrus.site/v1/";
    
    // Blob IDs for each fruit type (stored on Walrus decentralized storage)
    const APPLE_BLOB_ID: vector<u8> = b"readcJ34aWQRKUkiJlJVfF52d7LOGeR2OQFdl_QPmvA";
    const GRAPE_BLOB_ID: vector<u8> = b"S_Mi3AcsnZztZw9bo1u7UrJATDu58KYivFUGCscw_Z0";
    const LEMON_BLOB_ID: vector<u8> = b"KU9S7eN56I7BJ89ALkafb5ac2SzP5iSIds9znUvm2k0";
    const ORANGE_BLOB_ID: vector<u8> = b"ECZwwwylg04TKBKeNy8KRy0PAAmLRJUNaUdZDAlbYX8";
    const PEACH_BLOB_ID: vector<u8> = b"vQpwrGHC-MwoeyqjA2H4rNEYlgv9WEsX-EBzH5QURM8";
    const PEAR_BLOB_ID: vector<u8> = b"yL5YIDTDeIdJrJo657xxQDRfAXk4hZIhCOYwfsWdYas";
    const PINEAPPLE_BLOB_ID: vector<u8> = b"gL3dn3XOe73xfBXXGZTLd5o0CKq8LrmNqCdnBlLkXuY";
    const WATERMELON_BLOB_ID: vector<u8> = b"rgvQ9a9dPyUdqflKQ9amcUUS89Nun-ZxhmFIjcOKw3s";
    // Cherry and Melon use default (Apple for now - can be updated later)
    const CHERRY_BLOB_ID: vector<u8> = b"readcJ34aWQRKUkiJlJVfF52d7LOGeR2OQFdl_QPmvA";
    const MELON_BLOB_ID: vector<u8> = b"rgvQ9a9dPyUdqflKQ9amcUUS89Nun-ZxhmFIjcOKw3s";

    /// Get fruit blob ID for Walrus storage
    public(package) fun get_fruit_blob_id(fruit_type: u8): vector<u8> {
        if (fruit_type == cherry()) {
            CHERRY_BLOB_ID
        } else if (fruit_type == grape()) {
            GRAPE_BLOB_ID
        } else if (fruit_type == orange()) {
            ORANGE_BLOB_ID
        } else if (fruit_type == lemon()) {
            LEMON_BLOB_ID
        } else if (fruit_type == apple()) {
            APPLE_BLOB_ID
        } else if (fruit_type == pear()) {
            PEAR_BLOB_ID
        } else if (fruit_type == peach()) {
            PEACH_BLOB_ID
        } else if (fruit_type == pineapple()) {
            PINEAPPLE_BLOB_ID
        } else if (fruit_type == melon()) {
            MELON_BLOB_ID
        } else {
            WATERMELON_BLOB_ID
        }
    }

    /// Generate full image URL from Walrus blob ID
    public(package) fun get_fruit_image_url(fruit_type: u8): string::String {
        let blob_id = get_fruit_blob_id(fruit_type);
        let mut url = string::utf8(WALRUS_AGGREGATOR_URL);
        url.append(string::utf8(blob_id));
        url
    }
}
