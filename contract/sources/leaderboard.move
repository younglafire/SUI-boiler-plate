// ============================================================================
// Module: leaderboard
// Description: Weekly leaderboard competition system with prize distribution
// - 7-day epochs with random fruit type selection
// - Players pay 0.01 SUI to join (goes to prize pool)
// - Prize distribution: 1st=50%, 2nd=25%, 3rd=10%, Owner=10%, Treasury=5%
// - Auto-manages rounds (anyone can trigger new round when old one ends)
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::leaderboard {
    use sui::clock::Clock;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::random::{Self, Random};
    use sui::balance::{Self, Balance};
    use sui::event;
    use contract::player::{Self, PlayerInventory};

    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    const EPOCH_DURATION_MS: u64 = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const JOIN_FEE: u64 = 10_000_000; // 0.01 SUI (in MIST, 1 SUI = 1_000_000_000 MIST)
    
    // Prize distribution (in basis points, 10000 = 100%)
    const PRIZE_FIRST: u64 = 5000;   // 50%
    const PRIZE_SECOND: u64 = 2500;  // 25%
    const PRIZE_THIRD: u64 = 1000;   // 10%
    const PRIZE_OWNER: u64 = 1000;   // 10%
    // Remaining 5% goes to treasury
    
    // Error codes
    const E_ROUND_NOT_ACTIVE: u64 = 1001;
    const E_ALREADY_JOINED: u64 = 1002;
    const E_NOT_JOINED: u64 = 1003;
    const E_INSUFFICIENT_FEE: u64 = 1004;
    const E_ROUND_STILL_ACTIVE: u64 = 1005;
    const E_NO_FRUIT_OF_TYPE: u64 = 1006;
    const E_PRIZES_ALREADY_DISTRIBUTED: u64 = 1007;

    // ============================================================================
    // STRUCTS
    // ============================================================================

    /// Global leaderboard configuration (shared object, created once)
    public struct LeaderboardConfig has key {
        id: UID,
        current_round_id: u64,
        treasury: Balance<SUI>,          // Permanent treasury (5% of each round)
        owner: address,                   // Owner who receives 10% fee
        total_rounds_completed: u64,
        total_prizes_distributed: u64,
    }

    /// A single leaderboard round (shared object)
    public struct LeaderboardRound has key {
        id: UID,
        round_id: u64,
        fruit_type: u8,                   // The random fruit type for this round (1-10)
        start_time: u64,                  // Timestamp when round started
        end_time: u64,                    // Timestamp when round ends
        prize_pool: Balance<SUI>,         // All join fees for this round
        entries: Table<address, LeaderboardEntry>,
        participant_count: u64,
        is_active: bool,
        prizes_distributed: bool,         // Whether prizes have been paid out
        // Track top 3 for prize distribution
        first_place: address,
        first_weight: u64,
        second_place: address,
        second_weight: u64,
        third_place: address,
        third_weight: u64,
    }

    /// Individual player's leaderboard entry
    public struct LeaderboardEntry has store, drop, copy {
        player: address,
        best_weight: u64,                 // Weight of heaviest fruit of the round's type
        last_updated: u64,                // Last time entry was updated
        joined_at: u64,                   // When player joined
    }

    // ============================================================================
    // EVENTS
    // ============================================================================

    public struct RoundCreated has copy, drop {
        round_id: u64,
        fruit_type: u8,
        start_time: u64,
        end_time: u64,
    }

    public struct PlayerJoined has copy, drop {
        round_id: u64,
        player: address,
        fee_paid: u64,
        current_pool: u64,
    }

    public struct EntryUpdated has copy, drop {
        round_id: u64,
        player: address,
        new_best_weight: u64,
    }

    public struct RoundClosed has copy, drop {
        round_id: u64,
        total_pool: u64,
        total_participants: u64,
        first_place: address,
        first_weight: u64,
        second_place: address,
        second_weight: u64,
        third_place: address,
        third_weight: u64,
    }

    public struct PrizeDistributed has copy, drop {
        round_id: u64,
        rank: u64,
        winner: address,
        weight: u64,
        prize_amount: u64,
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /// Initialize the leaderboard system (call once)
    fun init(ctx: &mut TxContext) {
        let config = LeaderboardConfig {
            id: object::new(ctx),
            current_round_id: 0,
            treasury: balance::zero(),
            owner: ctx.sender(),  // Deployer is the owner
            total_rounds_completed: 0,
            total_prizes_distributed: 0,
        };
        transfer::share_object(config);
    }

    // ============================================================================
    // ROUND MANAGEMENT
    // ============================================================================

    /// Create a new leaderboard round (can be called by anyone)
    /// Automatically triggered when no active round exists
    public entry fun create_new_round(
        config: &mut LeaderboardConfig,
        clock: &Clock,
        random: &Random,
        ctx: &mut TxContext
    ) {
        let current_time = clock.timestamp_ms();
        
        // Generate new round ID
        let new_round_id = config.current_round_id + 1;
        config.current_round_id = new_round_id;

        // Randomly select fruit type (1-10)
        let mut generator = random::new_generator(random, ctx);
        let fruit_type = (random::generate_u8_in_range(&mut generator, 1, 10) as u8);

        let start_time = current_time;
        let end_time = current_time + EPOCH_DURATION_MS;

        let round = LeaderboardRound {
            id: object::new(ctx),
            round_id: new_round_id,
            fruit_type,
            start_time,
            end_time,
            prize_pool: balance::zero(),
            entries: table::new(ctx),
            participant_count: 0,
            is_active: true,
            prizes_distributed: false,
            first_place: @0x0,
            first_weight: 0,
            second_place: @0x0,
            second_weight: 0,
            third_place: @0x0,
            third_weight: 0,
        };

        event::emit(RoundCreated {
            round_id: new_round_id,
            fruit_type,
            start_time,
            end_time,
        });

        transfer::share_object(round);
    }

    /// Join the current leaderboard round by paying 0.01 SUI
    /// Fee goes directly to the round's prize pool
    public entry fun join_leaderboard(
        round: &mut LeaderboardRound,
        inventory: &PlayerInventory,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock.timestamp_ms();
        let player = ctx.sender();

        // Validate round is active
        assert!(round.is_active && current_time < round.end_time, E_ROUND_NOT_ACTIVE);
        
        // Check player hasn't already joined
        assert!(!table::contains(&round.entries, player), E_ALREADY_JOINED);

        // Validate payment
        let payment_value = coin::value(&payment);
        assert!(payment_value >= JOIN_FEE, E_INSUFFICIENT_FEE);

        // Take the fee, return excess
        let mut payment_balance = coin::into_balance(payment);
        let fee_balance = balance::split(&mut payment_balance, JOIN_FEE);
        
        // Add fee to round's prize pool
        balance::join(&mut round.prize_pool, fee_balance);

        // Return excess payment
        if (balance::value(&payment_balance) > 0) {
            let excess_coin = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(excess_coin, player);
        } else {
            balance::destroy_zero(payment_balance);
        };

        // Find the player's heaviest fruit of the round's fruit type
        let best_weight = find_heaviest_fruit_weight(inventory, round.fruit_type);

        // Create entry
        let entry = LeaderboardEntry {
            player,
            best_weight,
            last_updated: current_time,
            joined_at: current_time,
        };

        table::add(&mut round.entries, player, entry);
        round.participant_count = round.participant_count + 1;

        // Update top 3 rankings
        update_rankings(round, player, best_weight);

        event::emit(PlayerJoined {
            round_id: round.round_id,
            player,
            fee_paid: JOIN_FEE,
            current_pool: balance::value(&round.prize_pool),
        });
    }

    /// Update player's leaderboard entry (call after merging fruits)
    public entry fun update_entry(
        round: &mut LeaderboardRound,
        inventory: &PlayerInventory,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock.timestamp_ms();
        let player = ctx.sender();

        // Validate round is active
        assert!(round.is_active && current_time < round.end_time, E_ROUND_NOT_ACTIVE);
        
        // Check player has joined
        assert!(table::contains(&round.entries, player), E_NOT_JOINED);

        // Find current heaviest fruit
        let new_best_weight = find_heaviest_fruit_weight(inventory, round.fruit_type);

        // Update entry if better
        let entry = table::borrow_mut(&mut round.entries, player);
        if (new_best_weight > entry.best_weight) {
            entry.best_weight = new_best_weight;
            entry.last_updated = current_time;

            // Update top 3 rankings
            update_rankings(round, player, new_best_weight);

            event::emit(EntryUpdated {
                round_id: round.round_id,
                player,
                new_best_weight,
            });
        };
    }

    /// Close an expired round and distribute prizes
    /// Can be called by anyone when round has ended
    /// Distributes: 50% to 1st, 25% to 2nd, 10% to 3rd, 10% to owner, 5% to treasury
    public entry fun close_round_and_distribute(
        config: &mut LeaderboardConfig,
        round: &mut LeaderboardRound,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock.timestamp_ms();

        // Round must be expired
        assert!(current_time >= round.end_time, E_ROUND_STILL_ACTIVE);
        assert!(round.is_active, E_ROUND_NOT_ACTIVE);
        assert!(!round.prizes_distributed, E_PRIZES_ALREADY_DISTRIBUTED);

        // Mark round as inactive and prizes distributed
        round.is_active = false;
        round.prizes_distributed = true;
        config.total_rounds_completed = config.total_rounds_completed + 1;

        let total_pool = balance::value(&round.prize_pool);
        
        event::emit(RoundClosed {
            round_id: round.round_id,
            total_pool,
            total_participants: round.participant_count,
            first_place: round.first_place,
            first_weight: round.first_weight,
            second_place: round.second_place,
            second_weight: round.second_weight,
            third_place: round.third_place,
            third_weight: round.third_weight,
        });

        // If no participants or empty pool, nothing to distribute
        if (round.participant_count == 0 || total_pool == 0) {
            return
        };

        // Calculate prize amounts
        let first_prize = (total_pool * PRIZE_FIRST) / 10000;
        let second_prize = (total_pool * PRIZE_SECOND) / 10000;
        let third_prize = (total_pool * PRIZE_THIRD) / 10000;
        let owner_fee = (total_pool * PRIZE_OWNER) / 10000;

        // Distribute to 1st place
        if (round.first_place != @0x0 && first_prize > 0) {
            let prize_coin = coin::from_balance(
                balance::split(&mut round.prize_pool, first_prize),
                ctx
            );
            transfer::public_transfer(prize_coin, round.first_place);
            config.total_prizes_distributed = config.total_prizes_distributed + first_prize;
            
            event::emit(PrizeDistributed {
                round_id: round.round_id,
                rank: 1,
                winner: round.first_place,
                weight: round.first_weight,
                prize_amount: first_prize,
            });
        };

        // Distribute to 2nd place
        if (round.second_place != @0x0 && second_prize > 0) {
            let prize_coin = coin::from_balance(
                balance::split(&mut round.prize_pool, second_prize),
                ctx
            );
            transfer::public_transfer(prize_coin, round.second_place);
            config.total_prizes_distributed = config.total_prizes_distributed + second_prize;
            
            event::emit(PrizeDistributed {
                round_id: round.round_id,
                rank: 2,
                winner: round.second_place,
                weight: round.second_weight,
                prize_amount: second_prize,
            });
        };

        // Distribute to 3rd place
        if (round.third_place != @0x0 && third_prize > 0) {
            let prize_coin = coin::from_balance(
                balance::split(&mut round.prize_pool, third_prize),
                ctx
            );
            transfer::public_transfer(prize_coin, round.third_place);
            config.total_prizes_distributed = config.total_prizes_distributed + third_prize;
            
            event::emit(PrizeDistributed {
                round_id: round.round_id,
                rank: 3,
                winner: round.third_place,
                weight: round.third_weight,
                prize_amount: third_prize,
            });
        };

        // Send owner fee
        if (owner_fee > 0) {
            let owner_coin = coin::from_balance(
                balance::split(&mut round.prize_pool, owner_fee),
                ctx
            );
            transfer::public_transfer(owner_coin, config.owner);
        };

        // Remaining goes to treasury (5%)
        let remaining = balance::value(&round.prize_pool);
        if (remaining > 0) {
            let treasury_balance = balance::split(&mut round.prize_pool, remaining);
            balance::join(&mut config.treasury, treasury_balance);
        };
    }

    /// Reset player's inventory when round closes (fruits and seeds only, not lands)
    /// Player must call this after round ends to clear their inventory
    public entry fun reset_inventory_for_new_round(
        round: &LeaderboardRound,
        inventory: &mut PlayerInventory,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock.timestamp_ms();
        let player = ctx.sender();

        // Round must be closed
        assert!(!round.is_active || current_time >= round.end_time, E_ROUND_STILL_ACTIVE);
        
        // Player must have participated
        assert!(table::contains(&round.entries, player), E_NOT_JOINED);

        // Clear all fruits from inventory
        player::clear_inventory(inventory);
    }

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    /// Update top 3 rankings when a player joins or updates their weight
    fun update_rankings(round: &mut LeaderboardRound, player: address, weight: u64) {
        // Check if this weight beats any of the current top 3
        if (weight > round.first_weight) {
            // New first place - shift others down
            round.third_place = round.second_place;
            round.third_weight = round.second_weight;
            round.second_place = round.first_place;
            round.second_weight = round.first_weight;
            round.first_place = player;
            round.first_weight = weight;
        } else if (weight > round.second_weight && player != round.first_place) {
            // New second place - shift third down
            round.third_place = round.second_place;
            round.third_weight = round.second_weight;
            round.second_place = player;
            round.second_weight = weight;
        } else if (weight > round.third_weight && player != round.first_place && player != round.second_place) {
            // New third place
            round.third_place = player;
            round.third_weight = weight;
        } else if (player == round.first_place && weight > round.first_weight) {
            // Existing first place improved
            round.first_weight = weight;
        } else if (player == round.second_place && weight > round.second_weight) {
            // Existing second place improved - check if they beat first
            if (weight > round.first_weight) {
                round.second_place = round.first_place;
                round.second_weight = round.first_weight;
                round.first_place = player;
                round.first_weight = weight;
            } else {
                round.second_weight = weight;
            }
        } else if (player == round.third_place && weight > round.third_weight) {
            // Existing third place improved - check if they beat first or second
            if (weight > round.first_weight) {
                round.third_place = round.second_place;
                round.third_weight = round.second_weight;
                round.second_place = round.first_place;
                round.second_weight = round.first_weight;
                round.first_place = player;
                round.first_weight = weight;
            } else if (weight > round.second_weight) {
                round.third_place = round.second_place;
                round.third_weight = round.second_weight;
                round.second_place = player;
                round.second_weight = weight;
            } else {
                round.third_weight = weight;
            }
        }
    }

    /// Find the heaviest fruit of a specific type in player's inventory
    fun find_heaviest_fruit_weight(inventory: &PlayerInventory, target_fruit_type: u8): u64 {
        let count = player::get_inventory_count(inventory);
        let mut heaviest = 0u64;
        let mut i = 0;

        while (i < count) {
            let fruit = player::get_inventory_fruit(inventory, i);
            if (player::get_fruit_type(fruit) == target_fruit_type) {
                let weight = player::get_fruit_weight(fruit);
                if (weight > heaviest) {
                    heaviest = weight;
                };
            };
            i = i + 1;
        };

        heaviest
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /// Get round info including prize pool
    public fun get_round_info(round: &LeaderboardRound): (u64, u8, u64, u64, u64, bool, u64) {
        (
            round.round_id,
            round.fruit_type,
            round.start_time,
            round.end_time,
            round.participant_count,
            round.is_active,
            balance::value(&round.prize_pool)
        )
    }

    /// Get top 3 rankings
    public fun get_top_three(round: &LeaderboardRound): (address, u64, address, u64, address, u64) {
        (
            round.first_place,
            round.first_weight,
            round.second_place,
            round.second_weight,
            round.third_place,
            round.third_weight
        )
    }

    /// Get player's entry
    public fun get_player_entry(round: &LeaderboardRound, player: address): (u64, u64, u64) {
        if (table::contains(&round.entries, player)) {
            let entry = table::borrow(&round.entries, player);
            (entry.best_weight, entry.last_updated, entry.joined_at)
        } else {
            (0, 0, 0)
        }
    }

    /// Check if player has joined
    public fun has_joined(round: &LeaderboardRound, player: address): bool {
        table::contains(&round.entries, player)
    }

    /// Get current round ID from config
    public fun get_current_round_id(config: &LeaderboardConfig): u64 {
        config.current_round_id
    }

    /// Get treasury balance
    public fun get_treasury_balance(config: &LeaderboardConfig): u64 {
        balance::value(&config.treasury)
    }

    /// Get owner address
    public fun get_owner(config: &LeaderboardConfig): address {
        config.owner
    }

    /// Get total prizes distributed
    public fun get_total_prizes_distributed(config: &LeaderboardConfig): u64 {
        config.total_prizes_distributed
    }

    /// Check if round is expired
    public fun is_round_expired(round: &LeaderboardRound, clock: &Clock): bool {
        clock.timestamp_ms() >= round.end_time
    }

    /// Get time remaining in round (in milliseconds)
    public fun get_time_remaining(round: &LeaderboardRound, clock: &Clock): u64 {
        let current_time = clock.timestamp_ms();
        if (current_time >= round.end_time) {
            0
        } else {
            round.end_time - current_time
        }
    }

    /// Get prize pool amount
    public fun get_prize_pool(round: &LeaderboardRound): u64 {
        balance::value(&round.prize_pool)
    }

    /// Check if prizes have been distributed
    public fun prizes_distributed(round: &LeaderboardRound): bool {
        round.prizes_distributed
    }

    /// Calculate prize for a specific rank (in MIST)
    public fun calculate_prize(pool_amount: u64, rank: u64): u64 {
        if (rank == 1) {
            (pool_amount * PRIZE_FIRST) / 10000
        } else if (rank == 2) {
            (pool_amount * PRIZE_SECOND) / 10000
        } else if (rank == 3) {
            (pool_amount * PRIZE_THIRD) / 10000
        } else {
            0
        }
    }

    /// Get join fee
    public fun get_join_fee(): u64 {
        JOIN_FEE
    }

    /// Get epoch duration
    public fun get_epoch_duration(): u64 {
        EPOCH_DURATION_MS
    }
}
