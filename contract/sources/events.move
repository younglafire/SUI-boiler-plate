// =============================================================================
// MODULE: events
// DESCRIPTION: Event Definitions and Emitters for Fruit Game
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// This module contains all event structs and helper functions for emitting
// events throughout the game. Events are organized by functionality.
// =============================================================================

module contract::events {
    use sui::event;

    // ========================= GAME SESSION EVENTS ===========================
    
    /// Emitted when a new game session is created
    public struct GameStarted has copy, drop {
        player: address,
        session_id: ID,
    }

    /// Emitted when a fruit is dropped in the game
    public struct FruitDropped has copy, drop {
        session_id: ID,
        fruit_type: u8,
    }

    /// Emitted when two fruits merge into a bigger one
    public struct FruitsMerged has copy, drop {
        session_id: ID,
        from_type: u8,
        to_type: u8,
        seeds_earned: u64,
    }

    /// Emitted when player initiates a claim (must complete 5 more drops)
    public struct ClaimStarted has copy, drop {
        session_id: ID,
        pending_seeds: u64,
        drops_remaining: u64,
    }

    /// Emitted when harvest is successfully completed
    public struct HarvestCompleted has copy, drop {
        session_id: ID,
        seeds_harvested: u64,
    }

    /// Emitted when game ends (player loses)
    public struct GameOverEvent has copy, drop {
        session_id: ID,
        seeds_lost: u64,
    }

    /// Emitted when game is reset
    public struct GameReset has copy, drop {
        session_id: ID,
    }

    // ========================= PLAYER ACCOUNT EVENTS =========================

    /// Emitted when a new player account is created
    public struct PlayerCreated has copy, drop {
        player: address,
        initial_seeds: u64,
    }

    /// Emitted when seeds are minted (from game harvest)
    public struct SeedsMinted has copy, drop {
        player: address,
        amount: u64,
    }
    
    /// Emitted when seeds are spent on an action
    public struct SeedsSpent has copy, drop {
        player: address,
        amount: u64,
        reason: vector<u8>,
    }

    // ========================= LAND EVENTS ===================================

    /// Emitted when a new land is created
    public struct LandCreated has copy, drop {
        land_id: ID,
        owner: address,
        slots: u64,
    }

    /// Emitted when a land is upgraded (more slots)
    public struct LandUpgraded has copy, drop {
        land_id: ID,
        new_slots: u64,
        seeds_spent: u64,
    }

    /// Emitted when player switches active land
    public struct LandSwitched has copy, drop {
        player: address,
        from_land_id: ID,
        to_land_id: ID,
    }

    /// Emitted when seeds are transferred to land for planting
    public struct SeedsTransferred has copy, drop {
        from_session: ID,
        to_land: ID,
        amount: u64,
    }

    /// Emitted when a seed is planted in a land slot
    public struct FruitPlanted has copy, drop {
        land_id: ID,
        slot_index: u64,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        seeds_used: u64,
    }

    /// Emitted when a fruit is harvested from land (auto or manual)
    public struct FruitHarvested has copy, drop {
        land_id: ID,
        slot_index: u64,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    /// Emitted when fruit auto-harvests to inventory (no extra transaction)
    public struct AutoHarvestCompleted has copy, drop {
        land_id: ID,
        inventory_id: ID,
        fruits_harvested: u64,
    }

    // ========================= INVENTORY EVENTS ==============================

    /// Emitted when inventory is created
    public struct InventoryCreated has copy, drop {
        inventory_id: ID,
        owner: address,
        capacity: u64,
    }

    /// Emitted when inventory is upgraded (more capacity)
    public struct InventoryUpgraded has copy, drop {
        inventory_id: ID,
        new_capacity: u64,
        seeds_spent: u64,
    }

    /// Emitted when a fruit is added to inventory
    public struct FruitAddedToInventory has copy, drop {
        inventory_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    // ========================= EMIT FUNCTIONS ================================
    // Helper functions to emit events with proper parameters

    // Game Events
    public fun emit_game_started(player: address, session_id: ID) {
        event::emit(GameStarted { player, session_id });
    }

    public fun emit_fruit_dropped(session_id: ID, fruit_type: u8) {
        event::emit(FruitDropped { session_id, fruit_type });
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

    // Player Events
    public fun emit_player_created(player: address, initial_seeds: u64) {
        event::emit(PlayerCreated { player, initial_seeds });
    }

    public fun emit_seeds_minted(player: address, amount: u64) {
        event::emit(SeedsMinted { player, amount });
    }
    
    public fun emit_seeds_spent(player: address, amount: u64, reason: vector<u8>) {
        event::emit(SeedsSpent { player, amount, reason });
    }

    // Land Events
    public fun emit_land_created(land_id: ID, owner: address, slots: u64) {
        event::emit(LandCreated { land_id, owner, slots });
    }
    
    public fun emit_land_upgraded(land_id: ID, new_slots: u64, seeds_spent: u64) {
        event::emit(LandUpgraded { land_id, new_slots, seeds_spent });
    }
    
    public fun emit_land_switched(player: address, from_land_id: ID, to_land_id: ID) {
        event::emit(LandSwitched { player, from_land_id, to_land_id });
    }

    public fun emit_seeds_transferred(from_session: ID, to_land: ID, amount: u64) {
        event::emit(SeedsTransferred { from_session, to_land, amount });
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
        weight: u64
    ) {
        event::emit(FruitHarvested { land_id, slot_index, fruit_type, rarity, weight });
    }
    
    public fun emit_auto_harvest_completed(land_id: ID, inventory_id: ID, fruits_harvested: u64) {
        event::emit(AutoHarvestCompleted { land_id, inventory_id, fruits_harvested });
    }

    // Inventory Events
    public fun emit_inventory_created(inventory_id: ID, owner: address, capacity: u64) {
        event::emit(InventoryCreated { inventory_id, owner, capacity });
    }
    
    public fun emit_inventory_upgraded(inventory_id: ID, new_capacity: u64, seeds_spent: u64) {
        event::emit(InventoryUpgraded { inventory_id, new_capacity, seeds_spent });
    }
    
    public fun emit_fruit_added_to_inventory(
        inventory_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64
    ) {
        event::emit(FruitAddedToInventory { inventory_id, fruit_type, rarity, weight });
    }
}
