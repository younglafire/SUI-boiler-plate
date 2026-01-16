// ============================================================================
// Module: events
// Description: Event definitions and emitters for Fruit Game
// All game events are centralized here for easy tracking and indexing
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::events {
    use sui::event;

    // ============================================================================
    // PLAYER EVENTS
    // ============================================================================
    
    /// Emitted when a new player account is created
    public struct PlayerCreated has copy, drop {
        player: address,
        player_id: ID,
        land_id: ID,
    }

    /// Emitted when player earns seeds
    public struct SeedsEarned has copy, drop {
        player: address,
        amount: u64,
        total_seeds: u64,
    }

    /// Emitted when player spends seeds
    public struct SeedsSpent has copy, drop {
        player: address,
        amount: u64,
        purpose: vector<u8>, // "land_upgrade", "new_land", "plant", etc.
    }

    // ============================================================================
    // GAME EVENTS
    // ============================================================================
    
    /// Emitted when a new game session starts
    public struct GameStarted has copy, drop {
        player: address,
        session_id: ID,
    }

    /// Emitted when a fruit is dropped
    public struct FruitDropped has copy, drop {
        session_id: ID,
        fruit_type: u8,
        drops_remaining: u64,  // Track remaining drops
        is_claiming: bool,     // Whether in claim mode
    }

    /// Emitted when two fruits merge
    public struct FruitsMerged has copy, drop {
        session_id: ID,
        from_type: u8,
        to_type: u8,
        seeds_earned: u64,
    }

    /// Emitted when player starts claiming seeds
    public struct ClaimStarted has copy, drop {
        session_id: ID,
        pending_seeds: u64,
        drops_remaining: u64,
    }

    /// Emitted when harvest is completed (all 5 drops done)
    public struct HarvestCompleted has copy, drop {
        session_id: ID,
        seeds_harvested: u64,
    }

    /// Emitted when game ends (player lost)
    public struct GameOverEvent has copy, drop {
        session_id: ID,
        seeds_lost: u64,
    }

    /// Emitted when game is reset
    public struct GameReset has copy, drop {
        session_id: ID,
    }

    /// Emitted when drops are blocked (claiming mode active)
    public struct DropsBlocked has copy, drop {
        session_id: ID,
        reason: vector<u8>,
    }

    // ============================================================================
    // LAND EVENTS
    // ============================================================================

    /// Emitted when a new land is created
    public struct LandCreated has copy, drop {
        land_id: ID,
        owner: address,
        slots: u64,
    }

    /// Emitted when land is upgraded
    public struct LandUpgraded has copy, drop {
        land_id: ID,
        new_level: u64,
        new_slots: u64,
        cost: u64,
    }

    /// Emitted when a fruit is planted
    public struct FruitPlanted has copy, drop {
        land_id: ID,
        slot_index: u64,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        seeds_used: u64,
    }

    /// Emitted when a fruit is harvested (manual or auto)
    public struct FruitHarvested has copy, drop {
        land_id: ID,
        slot_index: u64,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        auto_harvested: bool,
    }

    /// Emitted when player switches active land
    public struct LandSwitched has copy, drop {
        player: address,
        from_land: ID,
        to_land: ID,
    }

    // ============================================================================
    // INVENTORY EVENTS
    // ============================================================================

    /// Emitted when inventory is upgraded
    public struct InventoryUpgraded has copy, drop {
        player: address,
        new_slots: u64,
        cost: u64,
    }

    /// Emitted when fruit is added to inventory
    public struct FruitAddedToInventory has copy, drop {
        player: address,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    /// Emitted when fruit is removed from inventory
    public struct FruitRemovedFromInventory has copy, drop {
        player: address,
        fruit_type: u8,
        inventory_index: u64,
    }

    /// Emitted when inventory is cleared (leaderboard reset)
    public struct InventoryCleared has copy, drop {
        player: address,
    }

    // ============================================================================
    // NFT EVENTS
    // ============================================================================

    /// Emitted when a fruit NFT is minted
    public struct FruitNFTMinted has copy, drop {
        nft_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        creator: address,
    }

    /// Emitted when a fruit NFT is burned
    public struct FruitNFTBurned has copy, drop {
        nft_id: ID,
        owner: address,
    }

    // ============================================================================
    // EMIT FUNCTIONS - PLAYER
    // ============================================================================

    public fun emit_player_created(player: address, player_id: ID, land_id: ID) {
        event::emit(PlayerCreated { player, player_id, land_id });
    }

    public fun emit_seeds_earned(player: address, amount: u64, total_seeds: u64) {
        event::emit(SeedsEarned { player, amount, total_seeds });
    }

    public fun emit_seeds_spent(player: address, amount: u64, purpose: vector<u8>) {
        event::emit(SeedsSpent { player, amount, purpose });
    }

    // ============================================================================
    // EMIT FUNCTIONS - GAME
    // ============================================================================

    public fun emit_game_started(player: address, session_id: ID) {
        event::emit(GameStarted { player, session_id });
    }

    public fun emit_fruit_dropped(
        session_id: ID, 
        fruit_type: u8,
        drops_remaining: u64,
        is_claiming: bool
    ) {
        event::emit(FruitDropped { 
            session_id, 
            fruit_type, 
            drops_remaining,
            is_claiming 
        });
    }

    public fun emit_fruits_merged(
        session_id: ID,
        from_type: u8,
        to_type: u8,
        seeds_earned: u64
    ) {
        event::emit(FruitsMerged { session_id, from_type, to_type, seeds_earned });
    }

    public fun emit_claim_started(
        session_id: ID,
        pending_seeds: u64,
        drops_remaining: u64
    ) {
        event::emit(ClaimStarted { session_id, pending_seeds, drops_remaining });
    }

    public fun emit_harvest_completed(session_id: ID, seeds_harvested: u64) {
        event::emit(HarvestCompleted { session_id, seeds_harvested });
    }

    public fun emit_game_over(session_id: ID, seeds_lost: u64) {
        event::emit(GameOverEvent { session_id, seeds_lost });
    }

    public fun emit_game_reset(session_id: ID) {
        event::emit(GameReset { session_id });
    }

    public fun emit_drops_blocked(session_id: ID, reason: vector<u8>) {
        event::emit(DropsBlocked { session_id, reason });
    }

    // ============================================================================
    // EMIT FUNCTIONS - LAND
    // ============================================================================

    public fun emit_land_created(land_id: ID, owner: address, slots: u64) {
        event::emit(LandCreated { land_id, owner, slots });
    }

    public fun emit_land_upgraded(land_id: ID, new_level: u64, new_slots: u64, cost: u64) {
        event::emit(LandUpgraded { land_id, new_level, new_slots, cost });
    }

    public fun emit_fruit_planted(
        land_id: ID,
        slot_index: u64,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        seeds_used: u64
    ) {
        event::emit(FruitPlanted { land_id, slot_index, fruit_type, rarity, weight, seeds_used });
    }

    public fun emit_fruit_harvested(
        land_id: ID,
        slot_index: u64,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        auto_harvested: bool
    ) {
        event::emit(FruitHarvested { 
            land_id, 
            slot_index, 
            fruit_type, 
            rarity, 
            weight, 
            auto_harvested 
        });
    }

    public fun emit_land_switched(player: address, from_land: ID, to_land: ID) {
        event::emit(LandSwitched { player, from_land, to_land });
    }

    // ============================================================================
    // EMIT FUNCTIONS - INVENTORY
    // ============================================================================

    public fun emit_inventory_upgraded(player: address, new_slots: u64, cost: u64) {
        event::emit(InventoryUpgraded { player, new_slots, cost });
    }

    public fun emit_fruit_added_to_inventory(
        player: address,
        fruit_type: u8,
        rarity: u8,
        weight: u64
    ) {
        event::emit(FruitAddedToInventory { player, fruit_type, rarity, weight });
    }

    public fun emit_fruit_removed_from_inventory(
        player: address,
        fruit_type: u8,
        inventory_index: u64
    ) {
        event::emit(FruitRemovedFromInventory { player, fruit_type, inventory_index });
    }

    public fun emit_inventory_cleared(player: address) {
        event::emit(InventoryCleared { player });
    }

    // ============================================================================
    // EMIT FUNCTIONS - NFT
    // ============================================================================

    public fun emit_fruit_nft_minted(
        nft_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        creator: address
    ) {
        event::emit(FruitNFTMinted { nft_id, fruit_type, rarity, weight, creator });
    }

    public fun emit_fruit_nft_burned(nft_id: ID, owner: address) {
        event::emit(FruitNFTBurned { nft_id, owner });
    }
}
