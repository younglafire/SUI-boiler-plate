// Game Session Module - Core game mechanics
// SPDX-License-Identifier: Apache-2.0

module contract::game {
    use sui::random::{Random, new_generator};
    use contract::types;
    use contract::events;

    // ============ STRUCTS ============
    
    /// Seed Bag - holds player's harvested seeds
    public struct SeedBag has key, store {
        id: UID,
        owner: address,
        seeds: u64,
    }

    /// Game Session - owned by player (optional, for advanced tracking)
    public struct GameSession has key, store {
        id: UID,
        player: address,
        score: u64,
        seeds_pending: u64,      // Seeds collected, waiting to be harvested
        seeds_harvested: u64,    // Seeds successfully harvested
        is_claiming: bool,       // Player pressed "Claim" button
        drops_remaining: u64,    // Drops needed to complete claim (5)
        game_over: bool,
        current_fruits: vector<u8>, // Active fruit levels on board
    }

    // ============ GAME FUNCTIONS ============

    /// Start a new game session
    public fun start_game(ctx: &mut TxContext): GameSession {
        let session = GameSession {
            id: object::new(ctx),
            player: ctx.sender(),
            score: 0,
            seeds_pending: 0,
            seeds_harvested: 0,
            is_claiming: false,
            drops_remaining: 0,
            game_over: false,
            current_fruits: vector::empty(),
        };
        
        events::emit_game_started(ctx.sender(), object::id(&session));
        
        session
    }

    /// Start game and transfer to player (entry point)
    entry fun start_game_entry(ctx: &mut TxContext) {
        let session = start_game(ctx);
        transfer::transfer(session, ctx.sender());
    }

    /// Drop a random fruit (1-3 level for balance)
    entry fun drop_fruit(
        session: &mut GameSession,
        r: &Random,
        ctx: &mut TxContext
    ) {
        assert!(!session.game_over, types::err_game_over());
        
        let mut generator = new_generator(r, ctx);
        let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 3);
        
        session.current_fruits.push_back(fruit_type);
        
        events::emit_fruit_dropped(object::id(session), fruit_type);
        
        // If in claiming mode, decrement drops
        if (session.is_claiming) {
            session.drops_remaining = session.drops_remaining - 1;
        };
    }

    /// Merge two same fruits into a bigger one
    entry fun merge_fruits(
        session: &mut GameSession,
        fruit_index_1: u64,
        fruit_index_2: u64,
        _ctx: &mut TxContext
    ) {
        assert!(!session.game_over, types::err_game_over());
        
        let fruit1 = *session.current_fruits.borrow(fruit_index_1);
        let fruit2 = *session.current_fruits.borrow(fruit_index_2);
        
        // Must be same type
        assert!(fruit1 == fruit2, types::err_invalid_fruit_level());
        
        // Remove the two fruits (remove higher index first)
        if (fruit_index_1 > fruit_index_2) {
            session.current_fruits.remove(fruit_index_1);
            session.current_fruits.remove(fruit_index_2);
        } else {
            session.current_fruits.remove(fruit_index_2);
            session.current_fruits.remove(fruit_index_1);
        };
        
        // Create new bigger fruit
        let max_level = types::max_fruit_level();
        let new_type = if (fruit1 < max_level) {
            fruit1 + 1
        } else {
            max_level
        };
        
        session.current_fruits.push_back(new_type);
        
        // Calculate seeds earned
        let seeds = types::calculate_seeds(new_type);
        session.seeds_pending = session.seeds_pending + seeds;
        session.score = session.score + (new_type as u64) * 10;
        
        events::emit_fruits_merged(
            object::id(session),
            fruit1,
            new_type,
            seeds
        );
    }

    /// Player wants to claim seeds - must complete 5 more drops
    entry fun start_claim(session: &mut GameSession, _ctx: &mut TxContext) {
        assert!(!session.game_over, types::err_game_over());
        assert!(!session.is_claiming, types::err_already_in_claim_mode());
        
        session.is_claiming = true;
        session.drops_remaining = types::drops_required();
        
        events::emit_claim_started(
            object::id(session),
            session.seeds_pending,
            session.drops_remaining
        );
    }

    /// Complete harvest after 5 drops
    entry fun complete_harvest(session: &mut GameSession, _ctx: &mut TxContext) {
        assert!(!session.game_over, types::err_game_over());
        assert!(session.is_claiming, types::err_not_in_claim_mode());
        assert!(session.drops_remaining == 0, types::err_drops_remaining());
        
        let harvested = session.seeds_pending;
        session.seeds_harvested = session.seeds_harvested + harvested;
        session.seeds_pending = 0;
        session.is_claiming = false;
        
        events::emit_harvest_completed(object::id(session), harvested);
    }

    /// Game over - lose all pending seeds
    entry fun trigger_game_over(session: &mut GameSession, _ctx: &mut TxContext) {
        let lost = session.seeds_pending;
        session.seeds_pending = 0;
        session.game_over = true;
        
        events::emit_game_over(object::id(session), lost);
    }

    /// Reset game to play again
    entry fun reset_game(session: &mut GameSession, _ctx: &mut TxContext) {
        session.score = 0;
        session.seeds_pending = 0;
        session.is_claiming = false;
        session.drops_remaining = 0;
        session.game_over = false;
        session.current_fruits = vector::empty();
        
        events::emit_game_reset(object::id(session));
    }

    // ============ SEED BAG FUNCTIONS ============

    /// Mint seeds from local game - creates or adds to SeedBag
    /// This is the simple version for hackathon - trusts frontend
    entry fun mint_seeds(amount: u64, ctx: &mut TxContext) {
        assert!(amount > 0, types::err_invalid_seed_count());
        
        let bag = SeedBag {
            id: object::new(ctx),
            owner: ctx.sender(),
            seeds: amount,
        };
        
        events::emit_seeds_minted(ctx.sender(), amount);
        transfer::transfer(bag, ctx.sender());
    }

    /// Merge two seed bags into one
    entry fun merge_seed_bags(bag1: SeedBag, bag2: SeedBag, ctx: &mut TxContext) {
        let SeedBag { id: id1, owner: _, seeds: seeds1 } = bag1;
        let SeedBag { id: id2, owner: _, seeds: seeds2 } = bag2;
        object::delete(id1);
        object::delete(id2);
        
        let merged = SeedBag {
            id: object::new(ctx),
            owner: ctx.sender(),
            seeds: seeds1 + seeds2,
        };
        
        transfer::transfer(merged, ctx.sender());
    }

    /// Spend seeds from bag (returns remaining)
    public(package) fun spend_seeds(bag: &mut SeedBag, amount: u64) {
        assert!(bag.seeds >= amount, types::err_insufficient_seeds());
        bag.seeds = bag.seeds - amount;
    }

    /// Consume entire SeedBag and return seeds (called by land module)
    public(package) fun consume_seed_bag(bag: SeedBag): u64 {
        let SeedBag { id, owner: _, seeds } = bag;
        object::delete(id);
        seeds
    }

    /// Get seeds in bag
    public fun get_bag_seeds(bag: &SeedBag): u64 {
        bag.seeds
    }

    // ============ VIEW FUNCTIONS ============

    public fun get_score(session: &GameSession): u64 {
        session.score
    }

    public fun get_pending_seeds(session: &GameSession): u64 {
        session.seeds_pending
    }

    public fun get_harvested_seeds(session: &GameSession): u64 {
        session.seeds_harvested
    }

    public fun is_claiming(session: &GameSession): bool {
        session.is_claiming
    }

    public fun get_drops_remaining(session: &GameSession): u64 {
        session.drops_remaining
    }

    public fun is_game_over(session: &GameSession): bool {
        session.game_over
    }

    public fun get_player(session: &GameSession): address {
        session.player
    }

    public fun get_fruits_count(session: &GameSession): u64 {
        session.current_fruits.length()
    }

    // ============ FRIEND FUNCTIONS (for land module) ============

    /// Deduct harvested seeds (called by land module)
    public(package) fun deduct_seeds(session: &mut GameSession, amount: u64) {
        assert!(session.seeds_harvested >= amount, types::err_insufficient_seeds());
        session.seeds_harvested = session.seeds_harvested - amount;
    }

    /// Get session ID
    public fun id(session: &GameSession): ID {
        object::id(session)
    }
}
