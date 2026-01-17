// ============================================================================
// Module: market
// Description: Marketplace and Merchant system for trading and merging fruits
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::market {
    use sui::clock::Clock;
    use contract::player::{Self, PlayerInventory};
    use contract::utils;

    // ============================================================================
    // MERGE LOGIC
    // ============================================================================

    /// Merge 10 fruits of the same type into 1 heavier fruit of the SAME type
    /// The weight of the new fruit is ~50% of the total weight of the input fruits
    /// This creates premium "heavy" fruits with high rarity
    /// Example: 10 apples weighing 200g each (2kg total) -> 1 apple weighing ~1kg
    public entry fun merge_fruits(
        inventory: &mut PlayerInventory,
        fruit_type: u8,
        count: u64, // Number of merges to perform (e.g. 1 = consume 10, produce 1)
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        // Validation - fruit type must be valid (1-10)
        assert!(fruit_type >= 1 && fruit_type <= utils::max_fruit_level(), utils::e_invalid_fruit_level());
        
        let mut merges_performed = 0;

        while (merges_performed < count) {
            // 1. Find 10 indices of the specified fruit type
            // Scan backwards to collect indices (highest to lowest) to safely remove them
            let mut indices_to_remove = vector::empty<u64>();
            let mut i = player::get_inventory_count(inventory);
            
            while (i > 0 && indices_to_remove.length() < 10) {
                i = i - 1;
                let fruit_ref = player::get_inventory_fruit(inventory, i);
                if (player::get_fruit_type(fruit_ref) == fruit_type) {
                    indices_to_remove.push_back(i);
                };
            };

            // Check if we found enough fruits
            assert!(indices_to_remove.length() == 10, utils::e_insufficient_fruits()); 

            // 2. Remove fruits and sum their weight
            let mut total_weight = 0u64;
            let mut k = 0;
            while (k < 10) {
                let index_to_remove = *indices_to_remove.borrow(k);
                let removed_fruit = player::remove_fruit_from_inventory(inventory, index_to_remove);
                total_weight = total_weight + player::get_fruit_weight(&removed_fruit);
                k = k + 1;
            };

            // 3. Calculate new weight (50% of total - realistic compression)
            // 10 fruits merged into 1, but we preserve half the total weight
            // This represents a "premium" condensed fruit
            let new_weight = total_weight / 2;
            
            // 4. Calculate rarity based on the new weight for this fruit type
            // Heavier = rarer, since normal fruits are much lighter
            let new_rarity = utils::calculate_weight_based_rarity(fruit_type, new_weight);
            let image_url = utils::get_fruit_image_url(fruit_type);
            
            // 5. Add the merged fruit back to inventory (SAME fruit type)
            player::add_fruit_to_inventory(
                inventory,
                fruit_type,  // Same fruit type, not upgraded
                new_rarity,
                new_weight,
                image_url,
                clock
            );

            merges_performed = merges_performed + 1;
        }
    }
}
