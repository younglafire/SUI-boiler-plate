// =============================================================================
// MODULE: fruit_nft
// DESCRIPTION: Fruit NFT - Tradeable Fruit Assets
// SPDX-License-Identifier: Apache-2.0
// =============================================================================
// This module handles creation and management of fruit NFTs that can be:
// - Minted from inventory fruits
// - Traded between players
// - Burned for seeds or other rewards
// =============================================================================

module contract::fruit_nft {
    use std::string::{Self, String};
    use contract::types;

    // ========================= STRUCTS =======================================

    /// FruitNFT - A tradeable fruit asset
    /// Can be created from harvested fruits in inventory
    public struct FruitNFT has key, store {
        id: UID,
        name: String,
        fruit_type: u8,      // Fruit level (1-10)
        rarity: u8,          // Rarity (1-5)
        weight: u64,         // Weight in grams
        created_by: address, // Original creator
    }

    // ========================= NFT FUNCTIONS =================================

    /// Mint a new Fruit NFT
    /// Returns the NFT object to the caller
    public fun mint(
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        ctx: &mut TxContext
    ): FruitNFT {
        let name = get_fruit_name(fruit_type, rarity);
        
        FruitNFT {
            id: object::new(ctx),
            name,
            fruit_type,
            rarity,
            weight,
            created_by: ctx.sender(),
        }
    }

    /// Entry point: Mint and transfer NFT to sender
    entry fun mint_entry(
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        ctx: &mut TxContext
    ) {
        let nft = mint(fruit_type, rarity, weight, ctx);
        transfer::transfer(nft, ctx.sender());
    }

    /// Burn NFT and delete it
    entry fun burn(nft: FruitNFT, _ctx: &mut TxContext) {
        let FruitNFT { id, name: _, fruit_type: _, rarity: _, weight: _, created_by: _ } = nft;
        object::delete(id);
    }

    /// Transfer NFT to another address
    entry fun transfer_nft(nft: FruitNFT, recipient: address, _ctx: &mut TxContext) {
        transfer::public_transfer(nft, recipient);
    }

    // ========================= HELPER FUNCTIONS ==============================

    /// Generate fruit name based on type and rarity
    fun get_fruit_name(fruit_type: u8, rarity: u8): String {
        // Rarity prefix
        let rarity_prefix = if (rarity == types::legendary()) {
            b"Legendary "
        } else if (rarity == types::epic()) {
            b"Epic "
        } else if (rarity == types::rare()) {
            b"Rare "
        } else if (rarity == types::uncommon()) {
            b"Uncommon "
        } else {
            b""
        };

        // Fruit name based on type
        let fruit_name = if (fruit_type == types::cherry()) {
            b"Cherry"
        } else if (fruit_type == types::grape()) {
            b"Grape"
        } else if (fruit_type == types::orange()) {
            b"Orange"
        } else if (fruit_type == types::lemon()) {
            b"Lemon"
        } else if (fruit_type == types::apple()) {
            b"Apple"
        } else if (fruit_type == types::pear()) {
            b"Pear"
        } else if (fruit_type == types::peach()) {
            b"Peach"
        } else if (fruit_type == types::pineapple()) {
            b"Pineapple"
        } else if (fruit_type == types::melon()) {
            b"Melon"
        } else {
            b"Watermelon"
        };

        let mut name = string::utf8(rarity_prefix);
        name.append(string::utf8(fruit_name));
        name
    }

    // ========================= VIEW FUNCTIONS ================================

    /// Get NFT name
    public fun get_name(nft: &FruitNFT): String {
        nft.name
    }

    /// Get fruit type (level 1-10)
    public fun get_type(nft: &FruitNFT): u8 {
        nft.fruit_type
    }

    /// Get rarity (1-5)
    public fun get_rarity(nft: &FruitNFT): u8 {
        nft.rarity
    }

    /// Get weight in grams
    public fun get_weight(nft: &FruitNFT): u64 {
        nft.weight
    }

    /// Get original creator address
    public fun get_creator(nft: &FruitNFT): address {
        nft.created_by
    }
}
