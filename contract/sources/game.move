// =============================================================================
// MODULE: game
// DESCRIPTION: Core Game Session & Seed Management
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// This module handles the fruit merge game mechanics including:
// - Game session management (start, drop, merge, game over)
// - Claim mechanism (must complete 5 drops after initiating claim)
// - Seed bag management (mint, merge, spend seeds)
// 
// KEY FIX: After pressing claim and completing 5 drops, player CANNOT
// drop more fruits - they must harvest or reset.
// =============================================================================

module contract::game {
    use sui::random::{Random, new_generator};
    use contract::types;
    use contract::events;

    // ========================= STRUCTS =======================================
    
    /// SeedBag - Holds player's harvested seeds (main currency)
    /// Seeds are used for:
    /// - Planting on land
    /// - Upgrading land (more slots)
    /// - Buying new lands
    /// - Upgrading inventory
    public struct SeedBag has key, store {
        id: UID,
        owner: address,
        seeds: u64,
    }

    /// GameSession - Tracks an active game instance
    /// Players can have multiple sessions, each tracking separate gameplay
    public struct GameSession has key, store {
        id: UID,
        player: address,
        score: u64,
        seeds_pending: u64,         // Seeds collected, waiting to be harvested
        seeds_harvested: u64,       // Total seeds successfully harvested in this session
        is_claiming: bool,          // Player has pressed "Claim" button
        drops_remaining: u64,       // Drops needed to complete claim (starts at 5)
        claim_complete: bool,       // TRUE when claim is done (drops_remaining = 0)
        game_over: bool,            // Game ended (lost)
        current_fruits: vector<u8>, // Active fruit levels on board
    }

    // ========================= GAME SESSION FUNCTIONS ========================

    /// Create and start a new game session
    /// Returns the session object to the caller
    public fun start_game(ctx: &mut TxContext): GameSession {
        let session = GameSession {
            id: object::new(ctx),
            player: ctx.sender(),
            score: 0,
            seeds_pending: 0,
            seeds_harvested: 0,
            is_claiming: false,
            drops_remaining: 0,
            claim_complete: false,
            game_over: false,
            current_fruits: vector::empty(),
        };
        
        events::emit_game_started(ctx.sender(), object::id(&session));
        
        session
    }

    /// Entry point: Start game and transfer to player
    entry fun start_game_entry(ctx: &mut TxContext) {
        let session = start_game(ctx);
        transfer::transfer(session, ctx.sender());
    }

    /// Drop a random fruit (levels 1-3 for balance)
    /// 
    /// IMPORTANT: Cannot drop if:
    /// - Game is over
    /// - Claim is complete (must harvest or reset first)
    entry fun drop_fruit(
        session: &mut GameSession,
        r: &Random,
        ctx: &mut TxContext
    ) {
        // Check game is not over
        assert!(!session.game_over, types::err_game_over());
        
        // KEY FIX: Cannot drop after claim is complete
        // Player must harvest their seeds or reset the game
        assert!(!session.claim_complete, types::err_claim_complete_cannot_drop());
        
        // Generate random fruit type (1-3 for initial drops)
        let mut generator = new_generator(r, ctx);
        let fruit_type = sui::random::generate_u8_in_range(&mut generator, 1, 3);
        
        // Add fruit to board
        session.current_fruits.push_back(fruit_type);
        
        events::emit_fruit_dropped(object::id(session), fruit_type);
        
        // If in claiming mode, decrement drops remaining
        if (session.is_claiming && session.drops_remaining > 0) {
            session.drops_remaining = session.drops_remaining - 1;
            
            // Check if claim is now complete
            if (session.drops_remaining == 0) {
                session.claim_complete = true;
            };
        };
    }

    /// Merge two same-level fruits into a bigger one
    /// Earns seeds based on the new fruit level
    entry fun merge_fruits(
        session: &mut GameSession,
        fruit_index_1: u64,
        fruit_index_2: u64,
        _ctx: &mut TxContext
    ) {
        assert!(!session.game_over, types::err_game_over());
        
        // Get fruit levels
        let fruit1 = *session.current_fruits.borrow(fruit_index_1);
        let fruit2 = *session.current_fruits.borrow(fruit_index_2);
        
        // Must be same type to merge
        assert!(fruit1 == fruit2, types::err_invalid_fruit_level());
        
        // Remove the two fruits (higher index first to preserve indices)
        if (fruit_index_1 > fruit_index_2) {
            session.current_fruits.remove(fruit_index_1);
            session.current_fruits.remove(fruit_index_2);
        } else {
            session.current_fruits.remove(fruit_index_2);
            session.current_fruits.remove(fruit_index_1);
        };
        
        // Create new bigger fruit (capped at max level)
        let max_level = types::max_fruit_level();
        let new_type = if (fruit1 < max_level) {
            fruit1 + 1
        } else {
            max_level
        };
        
        session.current_fruits.push_back(new_type);
        
        // Calculate seeds earned from this merge
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

    /// Initiate claim process - player must complete 5 more drops
    /// This creates risk: if game over before finishing, seeds are lost
    entry fun start_claim(session: &mut GameSession, _ctx: &mut TxContext) {
        assert!(!session.game_over, types::err_game_over());
        assert!(!session.is_claiming, types::err_already_in_claim_mode());
        assert!(session.seeds_pending > 0, types::err_invalid_seed_count());
        
        session.is_claiming = true;
        session.drops_remaining = types::drops_required();
        session.claim_complete = false;
        
        events::emit_claim_started(
            object::id(session),
            session.seeds_pending,
            session.drops_remaining
        );
    }

    /// Complete harvest after 5 drops - transfer pending seeds to harvested
    /// After this, player can mint seeds on-chain via mint_seeds
    entry fun complete_harvest(session: &mut GameSession, _ctx: &mut TxContext) {
        assert!(!session.game_over, types::err_game_over());
        assert!(session.is_claiming, types::err_not_in_claim_mode());
        assert!(session.drops_remaining == 0, types::err_drops_remaining());
        assert!(session.claim_complete, types::err_drops_remaining());
        
        let harvested = session.seeds_pending;
        session.seeds_harvested = session.seeds_harvested + harvested;
        session.seeds_pending = 0;
        session.is_claiming = false;
        session.claim_complete = false;
        
        events::emit_harvest_completed(object::id(session), harvested);
    }

    /// Trigger game over - lose all pending (unclaimed) seeds
    entry fun trigger_game_over(session: &mut GameSession, _ctx: &mut TxContext) {
        let lost = session.seeds_pending;
        session.seeds_pending = 0;
        session.game_over = true;
        
        events::emit_game_over(object::id(session), lost);
    }

    /// Reset game to play again (keeps harvested seeds)
    entry fun reset_game(session: &mut GameSession, _ctx: &mut TxContext) {
        session.score = 0;
        session.seeds_pending = 0;
        session.is_claiming = false;
        session.drops_remaining = 0;
        session.claim_complete = false;
        session.game_over = false;
        session.current_fruits = vector::empty();
        
        events::emit_game_reset(object::id(session));
    }

    // ========================= SEED BAG FUNCTIONS ============================

    /// Mint seeds into a new SeedBag
    /// Seeds are the main currency for all game actions
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

    /// Add seeds to an existing bag
    public(package) fun add_seeds(bag: &mut SeedBag, amount: u64) {
        bag.seeds = bag.seeds + amount;
    }

    /// Spend seeds from bag (used by other modules)
    public(package) fun spend_seeds(bag: &mut SeedBag, amount: u64) {
        assert!(bag.seeds >= amount, types::err_insufficient_seeds());
        bag.seeds = bag.seeds - amount;
    }

    /// Consume entire SeedBag and return seeds
    public(package) fun consume_seed_bag(bag: SeedBag): u64 {
        let SeedBag { id, owner: _, seeds } = bag;
        object::delete(id);
        seeds
    }

    // ========================= VIEW FUNCTIONS ================================

    /// Get seeds in bag
    public fun get_bag_seeds(bag: &SeedBag): u64 {
        bag.seeds
    }
    
    /// Get bag owner
    public fun get_bag_owner(bag: &SeedBag): address {
        bag.owner
    }

    /// Get current score
    public fun get_score(session: &GameSession): u64 {
        session.score
    }

    /// Get pending seeds (not yet claimed)
    public fun get_pending_seeds(session: &GameSession): u64 {
        session.seeds_pending
    }

    /// Get harvested seeds (claimed but not minted)
    public fun get_harvested_seeds(session: &GameSession): u64 {
        session.seeds_harvested
    }

    /// Check if player is in claiming mode
    public fun is_claiming(session: &GameSession): bool {
        session.is_claiming
    }

    /// Get remaining drops needed to complete claim
    public fun get_drops_remaining(session: &GameSession): u64 {
        session.drops_remaining
    }
    
    /// Check if claim is complete (cannot drop more)
    public fun is_claim_complete(session: &GameSession): bool {
        session.claim_complete
    }

    /// Check if game is over
    public fun is_game_over(session: &GameSession): bool {
        session.game_over
    }

    /// Get player address
    public fun get_player(session: &GameSession): address {
        session.player
    }

    /// Get number of fruits on board
    public fun get_fruits_count(session: &GameSession): u64 {
        session.current_fruits.length()
    }

    /// Get session ID
    public fun id(session: &GameSession): ID {
        object::id(session)
    }

    // ========================= FRIEND FUNCTIONS ==============================

    /// Deduct harvested seeds (called by land module for planting)
    public(package) fun deduct_seeds(session: &mut GameSession, amount: u64) {
        assert!(session.seeds_harvested >= amount, types::err_insufficient_seeds());
        session.seeds_harvested = session.seeds_harvested - amount;
    }
}
