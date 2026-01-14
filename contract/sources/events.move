// Events Module for Fruit Game
// SPDX-License-Identifier: Apache-2.0

module contract::events {
    use sui::event;

    // ============ GAME EVENTS ============
    
    public struct GameStarted has copy, drop {
        player: address,
        session_id: ID,
    }

    public struct FruitDropped has copy, drop {
        session_id: ID,
        fruit_type: u8,
    }

    public struct FruitsMerged has copy, drop {
        session_id: ID,
        from_type: u8,
        to_type: u8,
        seeds_earned: u64,
    }

    public struct ClaimStarted has copy, drop {
        session_id: ID,
        pending_seeds: u64,
        drops_remaining: u64,
    }

    public struct HarvestCompleted has copy, drop {
        session_id: ID,
        seeds_harvested: u64,
    }

    public struct GameOverEvent has copy, drop {
        session_id: ID,
        seeds_lost: u64,
    }

    public struct GameReset has copy, drop {
        session_id: ID,
    }

    // ============ LAND EVENTS ============

    public struct LandCreated has copy, drop {
        land_id: ID,
        owner: address,
    }

    public struct SeedsTransferred has copy, drop {
        from_session: ID,
        to_land: ID,
        amount: u64,
    }

    public struct FruitPlanted has copy, drop {
        land_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    public struct FruitHarvested has copy, drop {
        land_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
    }

    public struct SeedsMinted has copy, drop {
        player: address,
        amount: u64,
    }

    // ============ EMIT FUNCTIONS ============

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

    public fun emit_land_created(land_id: ID, owner: address) {
        event::emit(LandCreated { land_id, owner });
    }

    public fun emit_seeds_transferred(from_session: ID, to_land: ID, amount: u64) {
        event::emit(SeedsTransferred { from_session, to_land, amount });
    }

    public fun emit_fruit_planted(
        land_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64
    ) {
        event::emit(FruitPlanted { land_id, fruit_type, rarity, weight });
    }

    public fun emit_fruit_harvested(
        land_id: ID,
        fruit_type: u8,
        rarity: u8,
        weight: u64
    ) {
        event::emit(FruitHarvested { land_id, fruit_type, rarity, weight });
    }

    public fun emit_seeds_minted(player: address, amount: u64) {
        event::emit(SeedsMinted { player, amount });
    }
}
