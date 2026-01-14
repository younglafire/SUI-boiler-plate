// Player Land Module - Farming mechanics
// SPDX-License-Identifier: Apache-2.0

module contract::land {
    use sui::random::{Random, new_generator};
    use sui::sui::SUI;
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use contract::types;
    use contract::events;
    use contract::game::{Self, GameSession, SeedBag};

    // ============ CONSTANTS ============
    const MAX_FRUITS_PER_LAND: u64 = 6;
    const LAND_PRICE: u64 = 10_000_000; // 0.01 SUI = 10,000,000 MIST
    const GROW_TIME_MS: u64 = 15_000; // 15 seconds

    // ============ ERRORS ============
    const ELandFull: u64 = 100;
    const EFruitNotReady: u64 = 101;
    const EInsufficientPayment: u64 = 102;

    // ============ STRUCTS ============

    /// Player's Land for planting seeds
    public struct PlayerLand has key, store {
        id: UID,
        owner: address,
        seeds_balance: u64,
        planted_fruits: vector<PlantedFruit>,
    }

    /// A planted fruit growing on land
    public struct PlantedFruit has store, copy, drop {
        fruit_type: u8,
        rarity: u8,      // 1-5 (common to legendary)
        weight: u64,     // Random weight in grams
        planted_at: u64, // Timestamp in ms when planted
        is_ready: bool,  // True when grow time passed
    }

    // ============ LAND FUNCTIONS ============

    /// Create first land for FREE
    entry fun create_land(ctx: &mut TxContext) {
        let land = PlayerLand {
            id: object::new(ctx),
            owner: ctx.sender(),
            seeds_balance: 0,
            planted_fruits: vector::empty(),
        };
        
        events::emit_land_created(object::id(&land), ctx.sender());
        transfer::transfer(land, ctx.sender());
    }

    /// Buy additional land for 0.01 SUI
    entry fun buy_land(
        payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(coin::value(&payment) >= LAND_PRICE, EInsufficientPayment);
        
        // Burn the payment (in production, send to treasury)
        transfer::public_transfer(payment, @0x0);
        
        let land = PlayerLand {
            id: object::new(ctx),
            owner: ctx.sender(),
            seeds_balance: 0,
            planted_fruits: vector::empty(),
        };
        
        events::emit_land_created(object::id(&land), ctx.sender());
        transfer::transfer(land, ctx.sender());
    }

    /// Transfer seeds from game session to land
    entry fun transfer_seeds_to_land(
        session: &mut GameSession,
        land: &mut PlayerLand,
        amount: u64,
        _ctx: &mut TxContext
    ) {
        // Deduct from game session
        game::deduct_seeds(session, amount);
        
        // Add to land
        land.seeds_balance = land.seeds_balance + amount;
        
        events::emit_seeds_transferred(game::id(session), object::id(land), amount);
    }

    /// Transfer ALL seeds from SeedBag to land (consumes the bag)
    entry fun transfer_seeds_from_bag(
        bag: SeedBag,
        land: &mut PlayerLand,
        _ctx: &mut TxContext
    ) {
        let seeds = game::consume_seed_bag(bag);
        land.seeds_balance = land.seeds_balance + seeds;
    }

    /// Plant seeds to grow fruit with random rarity (limit 6 per land)
    entry fun plant_seeds(
        land: &mut PlayerLand,
        seeds_to_plant: u64,
        clock: &Clock,
        r: &Random,
        ctx: &mut TxContext
    ) {
        // Check land is not full
        assert!(land.planted_fruits.length() < MAX_FRUITS_PER_LAND, ELandFull);
        assert!(land.seeds_balance >= seeds_to_plant, types::err_insufficient_seeds());
        
        land.seeds_balance = land.seeds_balance - seeds_to_plant;
        
        let mut generator = new_generator(r, ctx);
        
        // Random fruit type (1-10)
        let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 10);
        
        // Random rarity (1-5), weighted by seeds planted
        let rarity_roll = sui::random::generate_u64_in_range(&mut generator, 1, 100);
        let rarity = calculate_rarity(rarity_roll, seeds_to_plant);
        
        // Random weight, influenced by seeds and rarity
        let base_weight = sui::random::generate_u64_in_range(&mut generator, 100, 500);
        let weight = base_weight + (seeds_to_plant * 5) + ((rarity as u64) * 50);
        
        // Get current timestamp
        let now = sui::clock::timestamp_ms(clock);
        
        let planted = PlantedFruit {
            fruit_type,
            rarity,
            weight,
            planted_at: now,
            is_ready: false,
        };
        
        land.planted_fruits.push_back(planted);
        
        events::emit_fruit_planted(object::id(land), fruit_type, rarity, weight);
    }

    /// Check and mark fruits as ready (after 15s grow time)
    entry fun check_fruits_ready(
        land: &mut PlayerLand,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        let now = sui::clock::timestamp_ms(clock);
        let len = land.planted_fruits.length();
        let mut i = 0;
        while (i < len) {
            let fruit = land.planted_fruits.borrow_mut(i);
            if (!fruit.is_ready && now >= fruit.planted_at + GROW_TIME_MS) {
                fruit.is_ready = true;
            };
            i = i + 1;
        };
    }

    /// Add seeds directly to land (for testing/rewards)
    entry fun add_seeds(
        land: &mut PlayerLand,
        amount: u64,
        _ctx: &mut TxContext
    ) {
        land.seeds_balance = land.seeds_balance + amount;
    }

    // ============ HELPER FUNCTIONS ============

    /// Calculate rarity based on roll and seeds planted
    /// More seeds = better chance for rare
    fun calculate_rarity(roll: u64, seeds_planted: u64): u8 {
        let bonus = seeds_planted / 2; // Every 2 seeds = +1% for higher rarity
        let adjusted_roll = if (roll + bonus > 100) { 100 } else { roll + bonus };
        
        if (adjusted_roll <= 50) {
            types::common()      // 50% base
        } else if (adjusted_roll <= 75) {
            types::uncommon()    // 25% base
        } else if (adjusted_roll <= 90) {
            types::rare()        // 15% base
        } else if (adjusted_roll <= 98) {
            types::epic()        // 8% base
        } else {
            types::legendary()   // 2% base
        }
    }

    // ============ VIEW FUNCTIONS ============

    public fun get_seeds_balance(land: &PlayerLand): u64 {
        land.seeds_balance
    }

    public fun get_planted_count(land: &PlayerLand): u64 {
        land.planted_fruits.length()
    }

    public fun get_owner(land: &PlayerLand): address {
        land.owner
    }

    public fun get_planted_fruit(land: &PlayerLand, index: u64): &PlantedFruit {
        land.planted_fruits.borrow(index)
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
}
