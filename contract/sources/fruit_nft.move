// Fruit NFT Module - Tradeable fruit assets
// SPDX-License-Identifier: Apache-2.0

module contract::fruit_nft {
    use std::string::{Self, String};
    use contract::types;

    // ============ STRUCTS ============

    /// Fruit NFT - can be traded, collected
    public struct FruitNFT has key, store {
        id: UID,
        name: String,
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        created_by: address,
    }

    // ============ NFT FUNCTIONS ============

    /// Mint a new Fruit NFT
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

    /// Mint and transfer to sender
    entry fun mint_entry(
        fruit_type: u8,
        rarity: u8,
        weight: u64,
        ctx: &mut TxContext
    ) {
        let nft = mint(fruit_type, rarity, weight, ctx);
        transfer::transfer(nft, ctx.sender());
    }

    /// Burn NFT
    entry fun burn(nft: FruitNFT, _ctx: &mut TxContext) {
        let FruitNFT { id, name: _, fruit_type: _, rarity: _, weight: _, created_by: _ } = nft;
        object::delete(id);
    }

    /// Transfer NFT to another address
    entry fun transfer_nft(nft: FruitNFT, recipient: address, _ctx: &mut TxContext) {
        transfer::public_transfer(nft, recipient);
    }

    // ============ HELPER FUNCTIONS ============

    fun get_fruit_name(fruit_type: u8, rarity: u8): String {
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

    // ============ VIEW FUNCTIONS ============

    public fun get_name(nft: &FruitNFT): String {
        nft.name
    }

    public fun get_type(nft: &FruitNFT): u8 {
        nft.fruit_type
    }

    public fun get_rarity(nft: &FruitNFT): u8 {
        nft.rarity
    }

    public fun get_weight(nft: &FruitNFT): u64 {
        nft.weight
    }

    public fun get_creator(nft: &FruitNFT): address {
        nft.created_by
    }
}
