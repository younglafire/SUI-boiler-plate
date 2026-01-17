// ============================================================================
// Module: land
// Description: Land management with farming slots and upgrades
// 
// FEATURES:
// - No account required - just connect wallet
// - Create first land for free
// - Can buy additional lands with seeds
// - Can upgrade lands to get more slots
// - Harvest fruits when ready
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::land {
    use sui::random::{Random, new_generator};
    use sui::clock::Clock;
    use sui::coin::Coin;
    use std::string::String;
    use contract::utils;
    use contract::events;
    use contract::seed::{Self, SEED, SeedAdminCap};
    use contract::player::{Self, PlayerInventory};

    // ============================================================================
    // STRUCTS
    // ============================================================================

    /// A single planting slot on the land
    public struct PlantedFruit has store, copy, drop {
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        image_url: String,
        seeds_used: u64,
        planted_at: u64,
        speed_boost_ms: u64,  // Total speed boost applied (in ms)
    }

    /// Player's farming land with planting slots
    public struct PlayerLand has key, store {
        id: UID,
        owner: address,
        level: u64,                              // Land level (affects slots)
        slots: vector<Option<PlantedFruit>>,     // Planting slots
        max_slots: u64,                          // Current max slots
        land_index: u64,                         // Index in player's land collection
        created_at: u64,
    }

    // ============================================================================
    // LAND CREATION
    // ============================================================================

    /// Create first land for player - no account required
    entry fun create_first_land(
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let now = sui::clock::timestamp_ms(clock);
        let initial_slots = utils::initial_land_slots();
        
        // Initialize empty slots
        let mut slots = vector::empty<Option<PlantedFruit>>();
        let mut i = 0u64;
        while (i < initial_slots) {
            slots.push_back(option::none());
            i = i + 1;
        };

        let land = PlayerLand {
            id: object::new(ctx),
            owner: sender,
            level: 1,
            slots,
            max_slots: initial_slots,
            land_index: 0,  // First land
            created_at: now,
        };
        
        events::emit_land_created(object::id(&land), sender, initial_slots);
        
        transfer::transfer(land, sender);
    }

    /// Buy a new land (costs SEED coins) - no account required
    entry fun buy_new_land(
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let now = sui::clock::timestamp_ms(clock);
        
        // Spend SEED coins
        let cost = utils::new_land_cost();
        let coin_value = seed::value(&payment);
        assert!(coin_value >= cost, utils::e_insufficient_seeds());
        
        // Return change if overpaid
        if (coin_value > cost) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, coin_value - cost, ctx);
            transfer::public_transfer(change, sender);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        // Create new land
        let initial_slots = utils::initial_land_slots();
        let mut slots = vector::empty<Option<PlantedFruit>>();
        let mut i = 0u64;
        while (i < initial_slots) {
            slots.push_back(option::none());
            i = i + 1;
        };

        let land = PlayerLand {
            id: object::new(ctx),
            owner: sender,
            level: 1,
            slots,
            max_slots: initial_slots,
            land_index: 0,  // Players manage their own land indexing
            created_at: now,
        };
        
        events::emit_land_created(object::id(&land), sender, initial_slots);
        
        transfer::transfer(land, sender);
    }

    /// Upgrade land to get more slots (costs SEED coins) - no account required
    entry fun upgrade_land(
        land: &mut PlayerLand,
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        ctx: &mut TxContext
    ) {
        // Check not at max
        assert!(land.max_slots < utils::max_land_slots(), utils::e_land_max_level());
        
        // Calculate cost and spend SEED coins
        let cost = utils::calculate_land_upgrade_cost(land.level);
        let coin_value = seed::value(&payment);
        assert!(coin_value >= cost, utils::e_insufficient_seeds());
        
        // Return change if overpaid
        if (coin_value > cost) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, coin_value - cost, ctx);
            transfer::public_transfer(change, land.owner);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        // Upgrade land
        land.level = land.level + 1;
        let new_max = land.max_slots + 2; // Add 2 slots per level
        
        // Add new empty slots
        while (land.slots.length() < new_max) {
            land.slots.push_back(option::none());
        };
        land.max_slots = new_max;
        
        events::emit_land_upgraded(
            object::id(land),
            land.level,
            new_max,
            cost
        );
    }

    // ============================================================================
    // PLANTING
    // ============================================================================

    /// Plant seeds in a specific slot (costs SEED coins) - no account required
    /// Fruits are automatically harvested to wallet when ready
    entry fun plant_in_slot(
        land: &mut PlayerLand,
        slot_index: u64,
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        // Validate slot
        assert!(slot_index < land.max_slots, utils::e_invalid_slot());
        assert!(option::is_none(land.slots.borrow(slot_index)), utils::e_slot_occupied());
        
        let seeds_to_use = seed::value(&payment);
        assert!(seeds_to_use > 0, utils::e_invalid_seed_count());
        
        // Spend SEED coins (burn them)
        seed::burn(admin_cap, payment);
        
        // Generate random fruit attributes
        let mut generator = new_generator(r, ctx);
        let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
        
        // Generate weight based on fruit type and seeds invested
        let random_weight_value = sui::random::generate_u64_in_range(&mut generator, 0, 10000);
        let weight = utils::generate_fruit_weight(fruit_type, seeds_to_use, random_weight_value);
        
        // Calculate rarity based on weight relative to fruit type
        let rarity = utils::calculate_weight_based_rarity(fruit_type, weight);
        let image_url = utils::get_fruit_image_url(fruit_type);
        
        let now = sui::clock::timestamp_ms(clock);
        
        let planted = PlantedFruit {
            fruit_type,
            rarity,
            weight,
            image_url,
            seeds_used: seeds_to_use,
            planted_at: now,
            speed_boost_ms: 0,  // No speed boost initially
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

    /// Plant in all empty slots at once (costs SEED coins) - no account required
    entry fun plant_all(
        land: &mut PlayerLand,
        payment: Coin<SEED>,
        seeds_per_slot: u64,
        admin_cap: &mut SeedAdminCap,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        assert!(seeds_per_slot > 0, utils::e_invalid_seed_count());
        
        // Count empty slots
        let mut empty_count = 0u64;
        let mut i = 0u64;
        while (i < land.max_slots) {
            if (option::is_none(land.slots.borrow(i))) {
                empty_count = empty_count + 1;
            };
            i = i + 1;
        };
        
        // Check payment is enough for all slots
        let total_seeds = empty_count * seeds_per_slot;
        let payment_value = seed::value(&payment);
        assert!(payment_value >= total_seeds, utils::e_insufficient_seeds());
        
        // Burn exact amount, return change if any
        if (payment_value > total_seeds) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, payment_value - total_seeds, ctx);
            transfer::public_transfer(change, land.owner);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        // Plant in all empty slots
        let mut generator = new_generator(r, ctx);
        let now = sui::clock::timestamp_ms(clock);
        
        i = 0;
        while (i < land.max_slots) {
            if (option::is_none(land.slots.borrow(i))) {
                // Generate random fruit
                let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
                
                // Generate weight based on fruit type and seeds invested
                let random_weight_value = sui::random::generate_u64_in_range(&mut generator, 0, 10000);
                let weight = utils::generate_fruit_weight(fruit_type, seeds_per_slot, random_weight_value);
                
                // Calculate rarity based on weight relative to fruit type
                let rarity = utils::calculate_weight_based_rarity(fruit_type, weight);
                let image_url = utils::get_fruit_image_url(fruit_type);

                let planted = PlantedFruit {
                    fruit_type,
                    rarity,
                    weight,
                    image_url,
                    seeds_used: seeds_per_slot,
                    planted_at: now,
                    speed_boost_ms: 0,  // No speed boost initially
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

    // ============================================================================
    // HARVESTING - Simplified (fruits ready to harvest can be cleared)
    // ============================================================================

    /// Clear all ready fruits from slots and add to inventory
    entry fun harvest_ready(
        land: &mut PlayerLand,
        inventory: &mut PlayerInventory,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        let now = sui::clock::timestamp_ms(clock);
        
        let mut i = 0u64;
        while (i < land.max_slots) {
            if (option::is_some(land.slots.borrow(i))) {
                let fruit = option::borrow(land.slots.borrow(i));
                
                // Check if fruit is ready (using rarity-based grow time and speed boost)
                if (utils::is_fruit_ready_with_boost(fruit.planted_at, now, fruit.rarity, fruit.speed_boost_ms)) {
                    // Extract fruit data
                    let fruit_type = fruit.fruit_type;
                    let rarity = fruit.rarity;
                    let weight = fruit.weight;
                    let image_url = fruit.image_url;
                    
                    // Add to inventory
                    player::add_fruit_to_inventory(
                        inventory,
                        fruit_type,
                        rarity,
                        weight,
                        image_url,
                        clock
                    );

                    // Clear slot
                    *land.slots.borrow_mut(i) = option::none();
                    
                    events::emit_fruit_harvested(
                        object::id(land),
                        i,
                        fruit_type,
                        rarity,
                        weight,
                        true  // auto_harvested = true
                    );
                };
            };
            i = i + 1;
        };
    }

    // ============================================================================
    // TOOL FUNCTIONS
    // ============================================================================

    /// Use watering can on a planted fruit to speed up growth by 25%
    entry fun use_watering_can(
        land: &mut PlayerLand,
        slot_index: u64,
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        _ctx: &mut TxContext
    ) {
        // Validate slot has a fruit
        assert!(slot_index < land.max_slots, utils::e_invalid_slot());
        assert!(option::is_some(land.slots.borrow(slot_index)), utils::e_slot_empty());
        
        // Check payment
        let cost = utils::watering_can_cost();
        let coin_value = seed::value(&payment);
        assert!(coin_value >= cost, utils::e_insufficient_seeds());
        
        // Burn payment (return change if overpaid)
        if (coin_value > cost) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, coin_value - cost, _ctx);
            transfer::public_transfer(change, land.owner);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        // Apply 25% speed boost
        let fruit = option::borrow(land.slots.borrow(slot_index));
        let grow_time = utils::get_grow_time_by_rarity(fruit.rarity);
        let boost = grow_time / 4;  // 25%
        
        let fruit_mut = option::borrow_mut(land.slots.borrow_mut(slot_index));
        fruit_mut.speed_boost_ms = fruit_mut.speed_boost_ms + boost;
    }

    /// Use fertilizer on a planted fruit to speed up growth by 50%
    entry fun use_fertilizer(
        land: &mut PlayerLand,
        slot_index: u64,
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        _ctx: &mut TxContext
    ) {
        // Validate slot has a fruit
        assert!(slot_index < land.max_slots, utils::e_invalid_slot());
        assert!(option::is_some(land.slots.borrow(slot_index)), utils::e_slot_empty());
        
        // Check payment
        let cost = utils::fertilizer_cost();
        let coin_value = seed::value(&payment);
        assert!(coin_value >= cost, utils::e_insufficient_seeds());
        
        // Burn payment (return change if overpaid)
        if (coin_value > cost) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, coin_value - cost, _ctx);
            transfer::public_transfer(change, land.owner);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        // Apply 50% speed boost
        let fruit = option::borrow(land.slots.borrow(slot_index));
        let grow_time = utils::get_grow_time_by_rarity(fruit.rarity);
        let boost = grow_time / 2;  // 50%
        
        let fruit_mut = option::borrow_mut(land.slots.borrow_mut(slot_index));
        fruit_mut.speed_boost_ms = fruit_mut.speed_boost_ms + boost;
    }

    /// Use shovel to remove a planted fruit (burns the fruit)
    entry fun use_shovel(
        land: &mut PlayerLand,
        slot_index: u64,
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        _ctx: &mut TxContext
    ) {
        // Validate slot has a fruit
        assert!(slot_index < land.max_slots, utils::e_invalid_slot());
        assert!(option::is_some(land.slots.borrow(slot_index)), utils::e_slot_empty());
        
        // Check payment
        let cost = utils::shovel_cost();
        let coin_value = seed::value(&payment);
        assert!(coin_value >= cost, utils::e_insufficient_seeds());
        
        // Burn payment (return change if overpaid)
        if (coin_value > cost) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, coin_value - cost, _ctx);
            transfer::public_transfer(change, land.owner);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        // Clear the slot (fruit is burned/removed)
        *land.slots.borrow_mut(slot_index) = option::none();
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    public fun get_level(land: &PlayerLand): u64 {
        land.level
    }

    public fun get_max_slots(land: &PlayerLand): u64 {
        land.max_slots
    }

    public fun get_owner(land: &PlayerLand): address {
        land.owner
    }

    public fun get_land_index(land: &PlayerLand): u64 {
        land.land_index
    }

    public fun get_slot(land: &PlayerLand, index: u64): &Option<PlantedFruit> {
        land.slots.borrow(index)
    }

    public fun is_slot_empty(land: &PlayerLand, index: u64): bool {
        option::is_none(land.slots.borrow(index))
    }

    public fun get_fruit_type(fruit: &PlantedFruit): u8 {
        fruit.fruit_type
    }

    public fun get_fruit_rarity(fruit: &PlantedFruit): u8 {
        fruit.rarity
    }

    public fun get_fruit_weight(fruit: &PlantedFruit): u64 {
        fruit.weight
    }

    public fun get_fruit_image_url(fruit: &PlantedFruit): String {
        fruit.image_url
    }

    public fun get_planted_at(fruit: &PlantedFruit): u64 {
        fruit.planted_at
    }

    public fun get_speed_boost(fruit: &PlantedFruit): u64 {
        fruit.speed_boost_ms
    }

    public fun is_fruit_ready_to_harvest(fruit: &PlantedFruit, clock: &Clock): bool {
        let now = sui::clock::timestamp_ms(clock);
        utils::is_fruit_ready_with_boost(fruit.planted_at, now, fruit.rarity, fruit.speed_boost_ms)
    }

    /// Count empty slots
    public fun count_empty_slots(land: &PlayerLand): u64 {
        let mut count = 0u64;
        let mut i = 0u64;
        while (i < land.max_slots) {
            if (option::is_none(land.slots.borrow(i))) {
                count = count + 1;
            };
            i = i + 1;
        };
        count
    }

    /// Count ready-to-harvest fruits (using rarity-based grow time and speed boost)
    public fun count_ready_fruits(land: &PlayerLand, clock: &Clock): u64 {
        let now = sui::clock::timestamp_ms(clock);
        let mut count = 0u64;
        let mut i = 0u64;
        while (i < land.max_slots) {
            if (option::is_some(land.slots.borrow(i))) {
                let fruit = option::borrow(land.slots.borrow(i));
                if (utils::is_fruit_ready_with_boost(fruit.planted_at, now, fruit.rarity, fruit.speed_boost_ms)) {
                    count = count + 1;
                };
            };
            i = i + 1;
        };
        count
    }

    public fun id(land: &PlayerLand): ID {
        object::id(land)
    }
}
