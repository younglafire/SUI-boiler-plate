// =============================================================================
// MODULE: land
// DESCRIPTION: Player Land & Inventory Management
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// This module handles:
// - Player land creation and management (6 slots by default)
// - Planting seeds in slots
// - Auto-harvesting when fruits mature (no extra transaction)
// - Land upgrades (add more slots using seeds)
// - Land switching (for players with multiple lands)
// - Inventory management with auto-creation
// =============================================================================

module contract::land {
    use sui::random::{Random, new_generator};
    use sui::clock::Clock;
    use contract::types;
    use contract::events;
    use contract::utils;
    use contract::game::{Self, SeedBag};

    // ========================= STRUCTS =======================================

    /// PlayerLand - A farming plot with slots for planting
    /// Players can own multiple lands and switch between them
    public struct PlayerLand has key, store {
        id: UID,
        owner: address,
        name: vector<u8>,                    // Land name for display
        slots: vector<Option<PlantedFruit>>, // Planting slots
        upgrade_level: u64,                  // Number of upgrades applied
        is_active: bool,                     // Currently selected land
    }

    /// PlantedFruit - A fruit growing in a land slot
    public struct PlantedFruit has store, copy, drop {
        fruit_type: u8,    // Fruit level (1-10)
        rarity: u8,        // 1-5 (Common to Legendary)
        weight: u64,       // Weight in grams
        seeds_used: u64,   // Seeds invested for planting
        planted_at: u64,   // Timestamp when planted
    }

    /// FruitInventory - Storage for harvested fruits
    /// Created automatically with first land
    public struct FruitInventory has key, store {
        id: UID,
        owner: address,
        fruits: vector<HarvestedFruit>,
        capacity: u64,        // Max fruits can store
        upgrade_level: u64,   // Number of upgrades
    }

    /// HarvestedFruit - A fruit in player's inventory
    public struct HarvestedFruit has store, copy, drop {
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    // ========================= ACCOUNT CREATION ==============================

    /// Create player account - creates first land AND inventory automatically
    /// This is the entry point for new players
    entry fun create_player_account(ctx: &mut TxContext) {
        let sender = ctx.sender();
        
        // Create inventory with default capacity
        let inventory = FruitInventory {
            id: object::new(ctx),
            owner: sender,
            fruits: vector::empty(),
            capacity: types::default_inventory_capacity(),
            upgrade_level: 0,
        };
        
        events::emit_inventory_created(
            object::id(&inventory),
            sender,
            types::default_inventory_capacity()
        );
        
        transfer::transfer(inventory, sender);
        
        // Create first land with default slots
        let num_slots = types::default_land_slots();
        let mut slots = vector::empty<Option<PlantedFruit>>();
        let mut i = 0;
        while (i < num_slots) {
            slots.push_back(option::none());
            i = i + 1;
        };

        let land = PlayerLand {
            id: object::new(ctx),
            owner: sender,
            name: b"My Farm",
            slots,
            upgrade_level: 0,
            is_active: true,
        };
        
        events::emit_land_created(object::id(&land), sender, num_slots);
        transfer::transfer(land, sender);
        
        // Emit player created event
        events::emit_player_created(sender, 0);
    }

    // ========================= LAND MANAGEMENT ===============================

    /// Create a new land (costs seeds)
    /// Player must have an existing SeedBag with enough seeds
    entry fun buy_new_land(
        bag: &mut SeedBag,
        land_name: vector<u8>,
        ctx: &mut TxContext
    ) {
        let cost = types::new_land_cost();
        assert!(game::get_bag_seeds(bag) >= cost, types::err_insufficient_seeds());
        
        // Spend seeds
        game::spend_seeds(bag, cost);
        
        // Create new land with default slots
        let num_slots = types::default_land_slots();
        let mut slots = vector::empty<Option<PlantedFruit>>();
        let mut i = 0;
        while (i < num_slots) {
            slots.push_back(option::none());
            i = i + 1;
        };

        let land = PlayerLand {
            id: object::new(ctx),
            owner: ctx.sender(),
            name: land_name,
            slots,
            upgrade_level: 0,
            is_active: false, // Not active by default
        };
        
        events::emit_land_created(object::id(&land), ctx.sender(), num_slots);
        events::emit_seeds_spent(ctx.sender(), cost, b"buy_new_land");
        transfer::transfer(land, ctx.sender());
    }

    /// Upgrade land to add more slots (costs seeds)
    entry fun upgrade_land(
        land: &mut PlayerLand,
        bag: &mut SeedBag,
        ctx: &mut TxContext
    ) {
        let cost = utils::calculate_land_upgrade_cost(land.upgrade_level);
        assert!(game::get_bag_seeds(bag) >= cost, types::err_insufficient_seeds());
        
        // Spend seeds
        game::spend_seeds(bag, cost);
        
        // Increase upgrade level
        land.upgrade_level = land.upgrade_level + 1;
        
        // Add new slots
        let slots_to_add = types::slots_per_upgrade();
        let mut i = 0;
        while (i < slots_to_add) {
            land.slots.push_back(option::none());
            i = i + 1;
        };
        
        let new_total = land.slots.length();
        events::emit_land_upgraded(object::id(land), new_total, cost);
        events::emit_seeds_spent(ctx.sender(), cost, b"upgrade_land");
    }

    /// Switch active land (deactivate current, activate new)
    entry fun switch_land(
        current_land: &mut PlayerLand,
        new_land: &mut PlayerLand,
        ctx: &mut TxContext
    ) {
        let from_id = object::id(current_land);
        let to_id = object::id(new_land);
        
        current_land.is_active = false;
        new_land.is_active = true;
        
        events::emit_land_switched(ctx.sender(), from_id, to_id);
    }

    // ========================= PLANTING ======================================

    /// Plant seeds in a specific slot
    /// Auto-checks and harvests any ready fruits first
    entry fun plant_in_slot(
        land: &mut PlayerLand,
        inventory: &mut FruitInventory,
        bag: &mut SeedBag,
        slot_index: u64,
        seeds_to_use: u64,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        let max_slots = land.slots.length();
        assert!(slot_index < max_slots, types::err_invalid_slot());
        assert!(seeds_to_use > 0, types::err_invalid_seed_count());
        assert!(game::get_bag_seeds(bag) >= seeds_to_use, types::err_insufficient_seeds());
        
        let now = sui::clock::timestamp_ms(clock);
        
        // Auto-harvest if slot has a ready fruit
        if (option::is_some(land.slots.borrow(slot_index))) {
            let fruit = option::borrow(land.slots.borrow(slot_index));
            if (utils::is_fruit_ready(fruit.planted_at, now)) {
                // Harvest it
                let harvested = HarvestedFruit {
                    fruit_type: fruit.fruit_type,
                    rarity: fruit.rarity,
                    weight: fruit.weight,
                };
                
                // Add to inventory if capacity allows
                if (inventory.fruits.length() < inventory.capacity) {
                    events::emit_fruit_harvested(
                        object::id(land),
                        slot_index,
                        harvested.fruit_type,
                        harvested.rarity,
                        harvested.weight
                    );
                    inventory.fruits.push_back(harvested);
                    events::emit_fruit_added_to_inventory(
                        object::id(inventory),
                        harvested.fruit_type,
                        harvested.rarity,
                        harvested.weight
                    );
                };
                
                // Clear slot
                *land.slots.borrow_mut(slot_index) = option::none();
            };
        };
        
        // Now check slot is empty
        assert!(option::is_none(land.slots.borrow(slot_index)), types::err_slot_occupied());
        
        // Spend seeds
        game::spend_seeds(bag, seeds_to_use);
        
        // Generate random fruit properties
        let mut generator = new_generator(r, ctx);
        let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
        let rarity_roll = sui::random::generate_u64_in_range(&mut generator, 1, 100);
        let rarity = utils::calculate_rarity(rarity_roll, seeds_to_use);
        let base_weight = sui::random::generate_u64_in_range(&mut generator, 100, 500);
        let weight = utils::calculate_weight(base_weight, seeds_to_use, rarity);
        
        let planted = PlantedFruit {
            fruit_type,
            rarity,
            weight,
            seeds_used: seeds_to_use,
            planted_at: now,
        };
        
        // Place in slot
        *land.slots.borrow_mut(slot_index) = option::some(planted);
        
        events::emit_fruit_planted(
            object::id(land),
            slot_index,
            fruit_type,
            rarity,
            weight,
            seeds_to_use
        );
    }

    /// Plant in all empty slots at once
    entry fun plant_batch(
        land: &mut PlayerLand,
        inventory: &mut FruitInventory,
        bag: &mut SeedBag,
        seeds_per_slot: u64,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        assert!(seeds_per_slot > 0, types::err_invalid_seed_count());
        
        let now = sui::clock::timestamp_ms(clock);
        let max_slots = land.slots.length();
        
        // First pass: auto-harvest all ready fruits
        let mut i = 0u64;
        while (i < max_slots) {
            if (option::is_some(land.slots.borrow(i))) {
                let fruit = option::borrow(land.slots.borrow(i));
                if (utils::is_fruit_ready(fruit.planted_at, now)) {
                    let harvested = HarvestedFruit {
                        fruit_type: fruit.fruit_type,
                        rarity: fruit.rarity,
                        weight: fruit.weight,
                    };
                    
                    if (inventory.fruits.length() < inventory.capacity) {
                        events::emit_fruit_harvested(
                            object::id(land),
                            i,
                            harvested.fruit_type,
                            harvested.rarity,
                            harvested.weight
                        );
                        inventory.fruits.push_back(harvested);
                        events::emit_fruit_added_to_inventory(
                            object::id(inventory),
                            harvested.fruit_type,
                            harvested.rarity,
                            harvested.weight
                        );
                    };
                    
                    *land.slots.borrow_mut(i) = option::none();
                };
            };
            i = i + 1;
        };
        
        // Count empty slots after auto-harvest
        let mut empty_count = 0u64;
        i = 0;
        while (i < max_slots) {
            if (option::is_none(land.slots.borrow(i))) {
                empty_count = empty_count + 1;
            };
            i = i + 1;
        };
        
        // Check we have enough seeds
        let total_seeds = empty_count * seeds_per_slot;
        assert!(game::get_bag_seeds(bag) >= total_seeds, types::err_insufficient_seeds());
        
        // Plant in all empty slots
        let mut generator = new_generator(r, ctx);
        i = 0;
        while (i < max_slots) {
            if (option::is_none(land.slots.borrow(i))) {
                // Spend seeds
                game::spend_seeds(bag, seeds_per_slot);
                
                // Generate random fruit
                let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
                let rarity_roll = sui::random::generate_u64_in_range(&mut generator, 1, 100);
                let rarity = utils::calculate_rarity(rarity_roll, seeds_per_slot);
                let base_weight = sui::random::generate_u64_in_range(&mut generator, 100, 500);
                let weight = utils::calculate_weight(base_weight, seeds_per_slot, rarity);
                
                let planted = PlantedFruit {
                    fruit_type,
                    rarity,
                    weight,
                    seeds_used: seeds_per_slot,
                    planted_at: now,
                };
                
                *land.slots.borrow_mut(i) = option::some(planted);
                
                events::emit_fruit_planted(
                    object::id(land),
                    i,
                    fruit_type,
                    rarity,
                    weight,
                    seeds_per_slot
                );
            };
            i = i + 1;
        };
    }

    // ========================= HARVESTING ====================================

    /// Auto-harvest all ready fruits to inventory
    /// Called automatically but can also be triggered manually
    entry fun auto_harvest_all(
        land: &mut PlayerLand,
        inventory: &mut FruitInventory,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        let now = sui::clock::timestamp_ms(clock);
        let max_slots = land.slots.length();
        let mut harvested_count = 0u64;
        
        let mut i = 0u64;
        while (i < max_slots) {
            if (option::is_some(land.slots.borrow(i))) {
                let fruit = option::borrow(land.slots.borrow(i));
                if (utils::is_fruit_ready(fruit.planted_at, now)) {
                    let harvested = HarvestedFruit {
                        fruit_type: fruit.fruit_type,
                        rarity: fruit.rarity,
                        weight: fruit.weight,
                    };
                    
                    // Check inventory capacity
                    if (inventory.fruits.length() < inventory.capacity) {
                        events::emit_fruit_harvested(
                            object::id(land),
                            i,
                            harvested.fruit_type,
                            harvested.rarity,
                            harvested.weight
                        );
                        inventory.fruits.push_back(harvested);
                        events::emit_fruit_added_to_inventory(
                            object::id(inventory),
                            harvested.fruit_type,
                            harvested.rarity,
                            harvested.weight
                        );
                        
                        // Clear slot
                        *land.slots.borrow_mut(i) = option::none();
                        harvested_count = harvested_count + 1;
                    };
                };
            };
            i = i + 1;
        };
        
        if (harvested_count > 0) {
            events::emit_auto_harvest_completed(
                object::id(land),
                object::id(inventory),
                harvested_count
            );
        };
    }

    /// Harvest a single slot manually
    entry fun harvest_slot(
        land: &mut PlayerLand,
        inventory: &mut FruitInventory,
        slot_index: u64,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        let max_slots = land.slots.length();
        assert!(slot_index < max_slots, types::err_invalid_slot());
        assert!(option::is_some(land.slots.borrow(slot_index)), types::err_slot_empty());
        
        let fruit = option::borrow(land.slots.borrow(slot_index));
        let now = sui::clock::timestamp_ms(clock);
        assert!(utils::is_fruit_ready(fruit.planted_at, now), types::err_fruit_not_ready());
        
        // Check inventory capacity
        assert!(inventory.fruits.length() < inventory.capacity, types::err_inventory_full());
        
        let harvested = HarvestedFruit {
            fruit_type: fruit.fruit_type,
            rarity: fruit.rarity,
            weight: fruit.weight,
        };
        
        // Clear slot
        *land.slots.borrow_mut(slot_index) = option::none();
        
        // Add to inventory
        inventory.fruits.push_back(harvested);
        
        events::emit_fruit_harvested(
            object::id(land),
            slot_index,
            harvested.fruit_type,
            harvested.rarity,
            harvested.weight
        );
        events::emit_fruit_added_to_inventory(
            object::id(inventory),
            harvested.fruit_type,
            harvested.rarity,
            harvested.weight
        );
    }

    // ========================= INVENTORY MANAGEMENT ==========================

    /// Create inventory separately (legacy support)
    entry fun create_inventory(ctx: &mut TxContext) {
        let inventory = FruitInventory {
            id: object::new(ctx),
            owner: ctx.sender(),
            fruits: vector::empty(),
            capacity: types::default_inventory_capacity(),
            upgrade_level: 0,
        };
        
        events::emit_inventory_created(
            object::id(&inventory),
            ctx.sender(),
            types::default_inventory_capacity()
        );
        transfer::transfer(inventory, ctx.sender());
    }

    /// Upgrade inventory capacity (costs seeds)
    entry fun upgrade_inventory(
        inventory: &mut FruitInventory,
        bag: &mut SeedBag,
        ctx: &mut TxContext
    ) {
        let cost = utils::calculate_inventory_upgrade_cost(inventory.upgrade_level);
        assert!(game::get_bag_seeds(bag) >= cost, types::err_insufficient_seeds());
        
        // Spend seeds
        game::spend_seeds(bag, cost);
        
        // Increase upgrade level and capacity
        inventory.upgrade_level = inventory.upgrade_level + 1;
        inventory.capacity = utils::calculate_inventory_capacity(inventory.upgrade_level);
        
        events::emit_inventory_upgraded(
            object::id(inventory),
            inventory.capacity,
            cost
        );
        events::emit_seeds_spent(ctx.sender(), cost, b"upgrade_inventory");
    }

    /// Create land separately (legacy support)
    entry fun create_land(ctx: &mut TxContext) {
        let num_slots = types::default_land_slots();
        let mut slots = vector::empty<Option<PlantedFruit>>();
        let mut i = 0;
        while (i < num_slots) {
            slots.push_back(option::none());
            i = i + 1;
        };

        let land = PlayerLand {
            id: object::new(ctx),
            owner: ctx.sender(),
            name: b"My Farm",
            slots,
            upgrade_level: 0,
            is_active: true,
        };
        
        events::emit_land_created(object::id(&land), ctx.sender(), num_slots);
        transfer::transfer(land, ctx.sender());
    }

    // ========================= VIEW FUNCTIONS ================================

    /// Get slot data
    public fun get_slot(land: &PlayerLand, index: u64): &Option<PlantedFruit> {
        land.slots.borrow(index)
    }
    
    /// Get number of slots
    public fun get_slot_count(land: &PlayerLand): u64 {
        land.slots.length()
    }

    /// Get land owner
    public fun get_owner(land: &PlayerLand): address {
        land.owner
    }
    
    /// Get land upgrade level
    public fun get_upgrade_level(land: &PlayerLand): u64 {
        land.upgrade_level
    }
    
    /// Check if land is active
    public fun is_active(land: &PlayerLand): bool {
        land.is_active
    }
    
    /// Get land name
    public fun get_name(land: &PlayerLand): vector<u8> {
        land.name
    }

    /// Get inventory fruit count
    public fun get_inventory_count(inv: &FruitInventory): u64 {
        inv.fruits.length()
    }
    
    /// Get inventory capacity
    public fun get_inventory_capacity(inv: &FruitInventory): u64 {
        inv.capacity
    }
    
    /// Get inventory upgrade level
    public fun get_inventory_upgrade_level(inv: &FruitInventory): u64 {
        inv.upgrade_level
    }

    /// Get fruit from inventory
    public fun get_inventory_fruit(inv: &FruitInventory, index: u64): &HarvestedFruit {
        inv.fruits.borrow(index)
    }
    
    /// Get planted fruit data
    public fun get_planted_fruit_data(fruit: &PlantedFruit): (u8, u8, u64, u64, u64) {
        (fruit.fruit_type, fruit.rarity, fruit.weight, fruit.seeds_used, fruit.planted_at)
    }
    
    /// Get harvested fruit data
    public fun get_harvested_fruit_data(fruit: &HarvestedFruit): (u8, u8, u64) {
        (fruit.fruit_type, fruit.rarity, fruit.weight)
    }
}
