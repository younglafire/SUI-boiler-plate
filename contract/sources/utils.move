// =============================================================================
// MODULE: utils
// DESCRIPTION: Utility Functions for Fruit Game
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// This module provides utility functions for randomness, calculations, and
// common operations used throughout the game contracts.
// =============================================================================

module contract::utils {
    use contract::types;

    // ========================= RARITY CALCULATION ============================
    
    /// Calculate rarity based on random roll and seeds planted
    /// More seeds = higher chance of better rarity
    /// 
    /// Base probabilities (no seed bonus):
    /// - Common: 50% (roll 1-50)
    /// - Uncommon: 25% (roll 51-75)
    /// - Rare: 15% (roll 76-90)
    /// - Epic: 8% (roll 91-98)
    /// - Legendary: 2% (roll 99-100)
    /// 
    /// Seed bonus: +1 to roll per 2 seeds planted (capped at 100)
    public fun calculate_rarity(roll: u64, seeds_planted: u64): u8 {
        // Add bonus based on seeds planted (1 point per 2 seeds)
        let bonus = seeds_planted / 2;
        let adjusted_roll = if (roll + bonus > 100) { 100 } else { roll + bonus };
        
        if (adjusted_roll <= 50) {
            types::common()
        } else if (adjusted_roll <= 75) {
            types::uncommon()
        } else if (adjusted_roll <= 90) {
            types::rare()
        } else if (adjusted_roll <= 98) {
            types::epic()
        } else {
            types::legendary()
        }
    }

    // ========================= WEIGHT CALCULATION ============================
    
    /// Calculate fruit weight based on base weight, seeds used, and rarity
    /// Weight formula: base_weight + (seeds * 5) + (rarity_bonus)
    /// 
    /// Rarity bonuses:
    /// - Common: +50
    /// - Uncommon: +100
    /// - Rare: +150
    /// - Epic: +250
    /// - Legendary: +400
    public fun calculate_weight(base_weight: u64, seeds_used: u64, rarity: u8): u64 {
        let rarity_bonus = if (rarity == types::common()) {
            50
        } else if (rarity == types::uncommon()) {
            100
        } else if (rarity == types::rare()) {
            150
        } else if (rarity == types::epic()) {
            250
        } else {
            400 // Legendary
        };
        
        base_weight + (seeds_used * 5) + rarity_bonus
    }

    // ========================= SEED CALCULATIONS =============================
    
    /// Calculate seeds earned from harvesting a fruit
    /// Based on fruit type, rarity, and weight
    /// 
    /// Base seeds = fruit_level / 2 (rounded up)
    /// Rarity multiplier applied from types module
    public fun calculate_harvest_seeds(fruit_type: u8, rarity: u8, weight: u64): u64 {
        // Base seeds from fruit level
        let base_seeds = ((fruit_type as u64) + 1) / 2;
        
        // Apply rarity multiplier
        let multiplier = types::rarity_multiplier(rarity);
        let seeds_from_rarity = (base_seeds * multiplier) / 100;
        
        // Bonus from weight (1 seed per 100g)
        let weight_bonus = weight / 100;
        
        seeds_from_rarity + weight_bonus
    }

    // ========================= LAND CALCULATIONS =============================
    
    /// Calculate the number of slots for a land based on upgrade level
    /// Initial: 6 slots
    /// Each upgrade: +3 slots
    public fun calculate_land_slots(upgrade_level: u64): u64 {
        types::default_land_slots() + (upgrade_level * types::slots_per_upgrade())
    }
    
    /// Calculate cost to upgrade land to next level
    /// Each upgrade costs more seeds (linear scaling)
    /// Cost = base_cost * (current_level + 1)
    public fun calculate_land_upgrade_cost(current_level: u64): u64 {
        types::land_upgrade_cost() * (current_level + 1)
    }

    // ========================= INVENTORY CALCULATIONS ========================
    
    /// Calculate inventory capacity based on upgrade level
    /// Initial: 50 fruits
    /// Each upgrade: +25 capacity
    public fun calculate_inventory_capacity(upgrade_level: u64): u64 {
        types::default_inventory_capacity() + (upgrade_level * types::inventory_capacity_per_upgrade())
    }
    
    /// Calculate cost to upgrade inventory to next level
    /// Cost = base_cost * (current_level + 1)
    public fun calculate_inventory_upgrade_cost(current_level: u64): u64 {
        types::inventory_upgrade_cost() * (current_level + 1)
    }

    // ========================= TIME CALCULATIONS =============================
    
    /// Check if a planted fruit is ready to harvest
    /// Returns true if current_time >= planted_time + grow_time
    public fun is_fruit_ready(planted_at: u64, current_time: u64): bool {
        current_time >= planted_at + types::grow_time_ms()
    }
    
    /// Get remaining grow time for a planted fruit
    /// Returns 0 if already ready
    public fun get_remaining_grow_time(planted_at: u64, current_time: u64): u64 {
        let ready_time = planted_at + types::grow_time_ms();
        if (current_time >= ready_time) {
            0
        } else {
            ready_time - current_time
        }
    }
}
