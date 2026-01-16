// ============================================================================
// Module: player
// Description: Player account system with inventory and land management
// Players automatically get inventory and first land when creating account
// Seeds are now a Coin type - see seed.move module
// ============================================================================
// SPDX-License-Identifier: Apache-2.0

module contract::player {
    use sui::clock::Clock;
    use sui::coin::Coin;
    use contract::utils;
    use contract::events;
    use contract::seed::{Self, SEED, SeedAdminCap};

    // ============================================================================
    // STRUCTS
    // ============================================================================

    /// Main player account - tracks stats (seeds are now Coin<SEED> held in wallet)
    public struct PlayerAccount has key, store {
        id: UID,
        owner: address,
        total_seeds_earned: u64,           // Lifetime earnings (for stats)
        total_games_played: u64,           // Game count
        inventory_slots: u64,              // Max inventory slots
        land_count: u64,                   // Number of lands owned
        active_land_index: u64,            // Currently selected land
        created_at: u64,                   // Creation timestamp
    }

    /// Harvested fruit stored in player's inventory
    public struct InventoryFruit has store, copy, drop {
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        harvested_at: u64,
    }

    /// Player's inventory - stores harvested fruits
    public struct PlayerInventory has key, store {
        id: UID,
        owner: address,
        fruits: vector<InventoryFruit>,
        max_slots: u64,
    }

    // ============================================================================
    // INITIALIZATION - Create Player Account
    // ============================================================================

    /// Create a new player account with inventory
    /// Note: Land is created separately - see init module for combined creation
    entry fun create_player(clock: &Clock, ctx: &mut TxContext) {
        let sender = ctx.sender();
        let now = sui::clock::timestamp_ms(clock);
        
        // Create player account
        let player = PlayerAccount {
            id: object::new(ctx),
            owner: sender,
            total_seeds_earned: 0,
            total_games_played: 0,
            inventory_slots: utils::initial_inventory_slots(),
            land_count: 1,  // Will have 1 land after calling create_first_land
            active_land_index: 0,
            created_at: now,
        };
        
        // Create inventory
        let inventory = PlayerInventory {
            id: object::new(ctx),
            owner: sender,
            fruits: vector::empty(),
            max_slots: utils::initial_inventory_slots(),
        };
        
        let player_id = object::id(&player);
        let inventory_id = object::id(&inventory);
        
        events::emit_player_created(sender, player_id, inventory_id);
        
        transfer::transfer(player, sender);
        transfer::transfer(inventory, sender);
    }

    // ============================================================================
    // SEED MANAGEMENT
    // ============================================================================

    /// Track seeds earned (for stats, actual coins go to wallet)
    public(package) fun add_seeds_earned(player: &mut PlayerAccount, amount: u64) {
        player.total_seeds_earned = player.total_seeds_earned + amount;
        
        events::emit_seeds_earned(player.owner, amount, player.total_seeds_earned);
    }

    /// Spend SEED coins for upgrades/purchases (burns the coins)
    public(package) fun spend_seeds(
        admin_cap: &mut SeedAdminCap,
        payment: Coin<SEED>,
        amount: u64,
        purpose: vector<u8>,
        owner: address,
        ctx: &mut TxContext
    ) {
        let coin_value = seed::value(&payment);
        assert!(coin_value >= amount, utils::e_insufficient_seeds());
        
        // If payment is more than needed, return change
        if (coin_value > amount) {
            let mut payment_mut = payment;
            let change = seed::split(&mut payment_mut, coin_value - amount, ctx);
            transfer::public_transfer(change, owner);
            seed::burn(admin_cap, payment_mut);
        } else {
            seed::burn(admin_cap, payment);
        };
        
        events::emit_seeds_spent(owner, amount, purpose);
    }

    /// Entry function to mint seeds (for testing/hackathon)
    /// No account required - seeds go directly to wallet
    entry fun mint_seeds(
        admin_cap: &mut SeedAdminCap,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, utils::e_invalid_seed_count());
        seed::mint_to(admin_cap, amount, ctx.sender(), ctx);
    }

    // ============================================================================
    // INVENTORY MANAGEMENT
    // ============================================================================

    /// Add a harvested fruit to inventory
    public(package) fun add_fruit_to_inventory(
        inventory: &mut PlayerInventory,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        clock: &Clock,
    ) {
        assert!(
            inventory.fruits.length() < inventory.max_slots,
            utils::e_inventory_full()
        );
        
        let now = sui::clock::timestamp_ms(clock);
        
        let fruit = InventoryFruit {
            fruit_type,
            rarity,
            weight,
            harvested_at: now,
        };
        
        inventory.fruits.push_back(fruit);
        
        events::emit_fruit_added_to_inventory(
            inventory.owner,
            fruit_type,
            rarity,
            weight
        );
    }

    /// Remove a fruit from inventory (for NFT minting, trading, etc.)
    public(package) fun remove_fruit_from_inventory(
        inventory: &mut PlayerInventory,
        index: u64,
    ): InventoryFruit {
        assert!(index < inventory.fruits.length(), utils::e_inventory_empty());
        
        let fruit = inventory.fruits.remove(index);
        
        events::emit_fruit_removed_from_inventory(
            inventory.owner,
            fruit.fruit_type,
            index
        );
        
        fruit
    }

    /// Clear all fruits from inventory (for leaderboard reset)
    public(package) fun clear_inventory(inventory: &mut PlayerInventory) {
        // Simply replace the fruits vector with an empty one
        // Old fruits have 'drop' ability so they're automatically cleaned up
        inventory.fruits = vector::empty();
        
        events::emit_inventory_cleared(inventory.owner);
    }

    /// Upgrade inventory capacity (costs SEED coins)
    entry fun upgrade_inventory(
        player: &mut PlayerAccount,
        inventory: &mut PlayerInventory,
        payment: Coin<SEED>,
        admin_cap: &mut SeedAdminCap,
        ctx: &mut TxContext
    ) {
        assert!(
            inventory.max_slots < utils::max_inventory_slots(),
            utils::e_inventory_full()
        );
        
        let cost = utils::calculate_inventory_upgrade_cost(inventory.max_slots);
        spend_seeds(admin_cap, payment, cost, b"inventory_upgrade", player.owner, ctx);
        
        // Add slots per upgrade (from utils constant)
        let slots_to_add = utils::inventory_slots_per_upgrade();
        inventory.max_slots = inventory.max_slots + slots_to_add;
        player.inventory_slots = inventory.max_slots;
        
        events::emit_inventory_upgraded(player.owner, inventory.max_slots, cost);
    }

    // ============================================================================
    // LAND TRACKING
    // ============================================================================

    /// Increment land count when player buys new land
    public(package) fun increment_land_count(player: &mut PlayerAccount) {
        player.land_count = player.land_count + 1;
    }

    /// Update active land index
    public(package) fun set_active_land(player: &mut PlayerAccount, index: u64) {
        assert!(index < player.land_count, utils::e_invalid_land_index());
        player.active_land_index = index;
    }

    /// Increment games played counter
    public(package) fun increment_games_played(player: &mut PlayerAccount) {
        player.total_games_played = player.total_games_played + 1;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    public fun get_total_seeds_earned(player: &PlayerAccount): u64 {
        player.total_seeds_earned
    }

    public fun get_games_played(player: &PlayerAccount): u64 {
        player.total_games_played
    }

    public fun get_land_count(player: &PlayerAccount): u64 {
        player.land_count
    }

    public fun get_active_land_index(player: &PlayerAccount): u64 {
        player.active_land_index
    }

    public fun get_inventory_slots(player: &PlayerAccount): u64 {
        player.inventory_slots
    }

    public fun get_owner(player: &PlayerAccount): address {
        player.owner
    }

    public fun get_inventory_count(inventory: &PlayerInventory): u64 {
        inventory.fruits.length()
    }

    public fun get_inventory_max_slots(inventory: &PlayerInventory): u64 {
        inventory.max_slots
    }

    public fun get_inventory_fruit(
        inventory: &PlayerInventory, 
        index: u64
    ): &InventoryFruit {
        inventory.fruits.borrow(index)
    }

    public fun get_fruit_type(fruit: &InventoryFruit): u8 {
        fruit.fruit_type
    }

    public fun get_fruit_rarity(fruit: &InventoryFruit): u8 {
        fruit.rarity
    }

    public fun get_fruit_weight(fruit: &InventoryFruit): u64 {
        fruit.weight
    }

    public fun id(player: &PlayerAccount): ID {
        object::id(player)
    }
}
