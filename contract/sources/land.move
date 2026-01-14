// Player Land Module - Farming mechanics with 6 slots
// SPDX-License-Identifier: Apache-2.0

module contract::land {
    use sui::random::{Random, new_generator};
    use sui::clock::Clock;
    use contract::types;
    use contract::events;
    use contract::game::{Self, SeedBag};

    // ============ CONSTANTS ============
    const MAX_SLOTS: u64 = 6;
    const GROW_TIME_MS: u64 = 15_000; // 15 seconds

    // ============ ERRORS ============
    const ESlotOccupied: u64 = 100;
    const ESlotEmpty: u64 = 101;
    const EFruitNotReady: u64 = 102;
    const EInvalidSlot: u64 = 103;
    const EInsufficientSeeds: u64 = 104;

    // ============ STRUCTS ============

    /// Player's Land with 6 planting slots
    public struct PlayerLand has key, store {
        id: UID,
        owner: address,
        slots: vector<Option<PlantedFruit>>, // 6 slots, None = empty
    }

    /// A planted fruit growing in a slot
    public struct PlantedFruit has store, copy, drop {
        fruit_type: u8,
        rarity: u8,      // 1-5 (common to legendary)
        weight: u64,     // Random weight in grams
        seeds_used: u64, // Seeds invested
        planted_at: u64, // Timestamp in ms when planted
    }

    /// Player's fruit inventory (harvested fruits)
    public struct FruitInventory has key, store {
        id: UID,
        owner: address,
        fruits: vector<HarvestedFruit>,
    }

    /// A harvested fruit in inventory
    public struct HarvestedFruit has store, copy, drop {
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    // ============ LAND FUNCTIONS ============

    /// Create land with 6 empty slots (FREE)
    entry fun create_land(ctx: &mut TxContext) {
        let mut slots = vector::empty<Option<PlantedFruit>>();
        let mut i = 0;
        while (i < MAX_SLOTS) {
            slots.push_back(option::none());
            i = i + 1;
        };

        let land = PlayerLand {
            id: object::new(ctx),
            owner: ctx.sender(),
            slots,
        };
        
        events::emit_land_created(object::id(&land), ctx.sender());
        transfer::transfer(land, ctx.sender());
    }

    /// Create fruit inventory
    entry fun create_inventory(ctx: &mut TxContext) {
        let inventory = FruitInventory {
            id: object::new(ctx),
            owner: ctx.sender(),
            fruits: vector::empty(),
        };
        transfer::transfer(inventory, ctx.sender());
    }

    /// Plant seeds in a specific slot (uses seeds from bag)
    entry fun plant_in_slot(
        land: &mut PlayerLand,
        bag: &mut SeedBag,
        slot_index: u64,
        seeds_to_use: u64,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        // Validate slot
        assert!(slot_index < MAX_SLOTS, EInvalidSlot);
        assert!(option::is_none(land.slots.borrow(slot_index)), ESlotOccupied);
        assert!(game::get_bag_seeds(bag) >= seeds_to_use, EInsufficientSeeds);
        assert!(seeds_to_use > 0, EInsufficientSeeds);
        
        // Spend seeds from bag
        game::spend_seeds(bag, seeds_to_use);
        
        // Generate random fruit
        let mut generator = new_generator(r, ctx);
        let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
        let rarity_roll = sui::random::generate_u64_in_range(&mut generator, 1, 100);
        let rarity = calculate_rarity(rarity_roll, seeds_to_use);
        let base_weight = sui::random::generate_u64_in_range(&mut generator, 100, 500);
        let weight = base_weight + (seeds_to_use * 5) + ((rarity as u64) * 50);
        
        let now = sui::clock::timestamp_ms(clock);
        
        let planted = PlantedFruit {
            fruit_type,
            rarity,
            weight,
            seeds_used: seeds_to_use,
            planted_at: now,
        };
        
        // Place in slot
        *land.slots.borrow_mut(slot_index) = option::some(planted);
        
        events::emit_fruit_planted(object::id(land), fruit_type, rarity, weight);
    }

    /// Plant in multiple slots at once (batch plant)
    entry fun plant_batch(
        land: &mut PlayerLand,
        bag: &mut SeedBag,
        seeds_per_slot: u64,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        assert!(seeds_per_slot > 0, EInsufficientSeeds);
        
        // Count empty slots
        let mut empty_count = 0u64;
        let mut i = 0u64;
        while (i < MAX_SLOTS) {
            if (option::is_none(land.slots.borrow(i))) {
                empty_count = empty_count + 1;
            };
            i = i + 1;
        };
        
        // Check we have enough seeds
        let total_seeds = empty_count * seeds_per_slot;
        assert!(game::get_bag_seeds(bag) >= total_seeds, EInsufficientSeeds);
        
        // Plant in all empty slots
        let mut generator = new_generator(r, ctx);
        let now = sui::clock::timestamp_ms(clock);
        
        i = 0;
        while (i < MAX_SLOTS) {
            if (option::is_none(land.slots.borrow(i))) {
                // Spend seeds
                game::spend_seeds(bag, seeds_per_slot);
                
                // Generate random fruit
                let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
                let rarity_roll = sui::random::generate_u64_in_range(&mut generator, 1, 100);
                let rarity = calculate_rarity(rarity_roll, seeds_per_slot);
                let base_weight = sui::random::generate_u64_in_range(&mut generator, 100, 500);
                let weight = base_weight + (seeds_per_slot * 5) + ((rarity as u64) * 50);
                
                let planted = PlantedFruit {
                    fruit_type,
                    rarity,
                    weight,
                    seeds_used: seeds_per_slot,
                    planted_at: now,
                };
                
                *land.slots.borrow_mut(i) = option::some(planted);
                
                events::emit_fruit_planted(object::id(land), fruit_type, rarity, weight);
            };
            i = i + 1;
        };
    }

    /// Harvest a ready fruit from slot → goes to inventory
    entry fun harvest_slot(
        land: &mut PlayerLand,
        inventory: &mut FruitInventory,
        slot_index: u64,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        assert!(slot_index < MAX_SLOTS, EInvalidSlot);
        assert!(option::is_some(land.slots.borrow(slot_index)), ESlotEmpty);
        
        let fruit = option::borrow(land.slots.borrow(slot_index));
        let now = sui::clock::timestamp_ms(clock);
        assert!(now >= fruit.planted_at + GROW_TIME_MS, EFruitNotReady);
        
        // Extract fruit data before clearing slot
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
            harvested.fruit_type, 
            harvested.rarity,
            harvested.weight
        );
    }

    /// Harvest all ready fruits at once
    entry fun harvest_all(
        land: &mut PlayerLand,
        inventory: &mut FruitInventory,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        let now = sui::clock::timestamp_ms(clock);
        
        let mut i = 0u64;
        while (i < MAX_SLOTS) {
            if (option::is_some(land.slots.borrow(i))) {
                let fruit = option::borrow(land.slots.borrow(i));
                if (now >= fruit.planted_at + GROW_TIME_MS) {
                    let harvested = HarvestedFruit {
                        fruit_type: fruit.fruit_type,
                        rarity: fruit.rarity,
                        weight: fruit.weight,
                    };
                    
                    *land.slots.borrow_mut(i) = option::none();
                    inventory.fruits.push_back(harvested);
                    
                    events::emit_fruit_harvested(
                        object::id(land), 
                        harvested.fruit_type, 
                        harvested.rarity,
                        harvested.weight
                    );
                };
            };
            i = i + 1;
        };
    }

    // ============ HELPER FUNCTIONS ============

    fun calculate_rarity(roll: u64, seeds_planted: u64): u8 {
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

    // ============ VIEW FUNCTIONS ============

    public fun get_slot(land: &PlayerLand, index: u64): &Option<PlantedFruit> {
        land.slots.borrow(index)
    }

    public fun get_owner(land: &PlayerLand): address {
        land.owner
    }

    public fun get_inventory_count(inv: &FruitInventory): u64 {
        inv.fruits.length()
    }

    public fun get_inventory_fruit(inv: &FruitInventory, index: u64): &HarvestedFruit {
        inv.fruits.borrow(index)
    }
}
