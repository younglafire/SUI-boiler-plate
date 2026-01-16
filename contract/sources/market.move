// ============================================================================
// Module: market
// Description: Marketplace and Merchant system for trading and merging fruits
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::market {
    use sui::clock::Clock; // Add Clock
    use contract::player::{Self, PlayerInventory};
    use contract::utils;

    // ============================================================================
    // MERGE LOGIC
    // ============================================================================

    /// Merge 10 fruits of the same type into 1 fruit of the next level
    /// The weight of the new fruit is the sum of the weights of the input fruits
    /// This creates "heavy" fruits that can have high rarity
    public entry fun merge_fruits(
        inventory: &mut PlayerInventory,
        fruit_type: u8,
        count: u64, // Number of merges to perform (e.g. 1 = consume 10, produce 1)
        clock: &Clock, // Added Clock parameter
        ctx: &mut TxContext
    ) {
        // Validation
        assert!(fruit_type < utils::max_fruit_level(), utils::e_invalid_fruit_level());
        
        let target_fruit_type = fruit_type + 1;
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
            let mut total_weight = 0;
            let mut k = 0;
            while (k < 10) {
                // Indices in 'indices_to_remove' are sorted Descending (e.g. 15, 12, 5...)
                // Removing index 15 doesn't affect index 12 or 5.
                // Removing index 12 doesn't affect index 5.
                // So we safely iterate and remove.
                let index_to_remove = *indices_to_remove.borrow(k);
                let removed_fruit = player::remove_fruit_from_inventory(inventory, index_to_remove); // This consumes the fruit
                total_weight = total_weight + player::get_fruit_weight(&removed_fruit);
                
                // InventoryFruit has 'drop' ability, so it's destroyed here automatically
                // But we need to make sure 'removed_fruit' is dropped.
                // Move 2024 automatically drops structs with 'drop'.
                k = k + 1;
            };

            // 3. Create new fruit
            // Weight is balanced (sum).
            // Calculate new rarity based on the new weight and target type
            let new_rarity = utils::calculate_weight_based_rarity(target_fruit_type, total_weight);
            
            // Add to inventory
            player::add_fruit_to_inventory(
                inventory,
                target_fruit_type,
                new_rarity,
                total_weight,
                clock
            );

            merges_performed = merges_performed + 1;
        }
    }
}
