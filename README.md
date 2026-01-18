# 🍉 Watery - Fruit Merge Game on SUI

A blockchain-powered fruit merge game built on the [SUI Network](https://sui.io/). Merge fruits, collect seeds, farm your land, and trade NFTs in this engaging Web3 gaming experience.

![SUI Network](https://img.shields.io/badge/SUI-Network-blue?style=flat-square)
![Move Language](https://img.shields.io/badge/Move-Smart%20Contracts-purple?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=flat-square)

## 📖 Overview

**Watery** is a fun and addictive merge game where players:
- 🎮 **Play** - Drop and merge fruits to earn SEED tokens
- 🌍 **Farm** - Plant seeds on your land and grow unique fruits
- 🎒 **Collect** - Build an inventory of fruits with varying rarities
- 💎 **Mint NFTs** - Convert rare fruits into tradeable NFTs
- 🏪 **Trade** - Merge fruits to create premium collectibles
- 🏆 **Compete** - Climb the leaderboard

## ✨ Features

### Core Gameplay
- **Merge Mechanics**: Drop fruits that merge when the same type collides, creating larger fruits
- **Seed Economy**: Earn SEED tokens by merging fruits - the in-game currency
- **Claim System**: Complete 5 drops after initiating a claim to harvest your seeds

### Farming System
- **Land Management**: Create and upgrade lands with multiple planting slots
- **Planting**: Invest SEED tokens to plant fruits with random types and rarities
- **Growth Tools**: Use watering cans (25% speed) and fertilizers (50% speed) to accelerate growth
- **Harvesting**: Collect ready fruits into your inventory

### Weight-Based Rarity System
Fruit rarity is determined by weight relative to fruit type:
| Rarity | Weight Threshold | Drop Rate |
|--------|------------------|-----------|
| Common | ≤ Normal weight | ~50% |
| Uncommon | 20-50% over normal | ~25% |
| Rare | 50-100% over normal | ~15% |
| Epic | 100-200% over normal | ~8% |
| Legendary | >200% over normal | ~2% |

### NFT & Trading
- Convert inventory fruits into tradeable NFTs
- Merge 10 fruits of the same type into 1 premium fruit with enhanced rarity

## 🏗️ Project Structure

```
SUI-boiler-plate/
├── contract/                 # Move smart contracts
│   ├── sources/
│   │   ├── game.move        # Core game mechanics
│   │   ├── land.move        # Land and farming system
│   │   ├── seed.move        # SEED token (currency)
│   │   ├── player.move      # Player accounts & inventory
│   │   ├── fruit_nft.move   # NFT minting & management
│   │   ├── market.move      # Marketplace & merging
│   │   ├── leaderboard.move # Ranking system
│   │   ├── utils.move       # Utilities & constants
│   │   └── events.move      # Event emissions
│   ├── tests/               # Contract tests
│   └── Move.toml            # Move package config
│
└── frontend/                # React frontend
    ├── src/
    │   ├── components/      # React components
    │   │   ├── FruitGame.tsx
    │   │   ├── PlayerLand.tsx
    │   │   ├── Inventory.tsx
    │   │   ├── Market.tsx
    │   │   ├── Leaderboard.tsx
    │   │   └── NFTCollection.tsx
    │   ├── styles/          # CSS modules
    │   ├── assets/          # Images & icons
    │   ├── hooks/           # Custom React hooks
    │   ├── utils/           # Frontend utilities
    │   └── App.tsx          # Main application
    ├── package.json
    └── vite.config.ts
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (recommended) or npm
- [SUI CLI](https://docs.sui.io/build/install) (for contract deployment)
- A SUI wallet (e.g., [Sui Wallet](https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil))

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Start development server**
   ```bash
   pnpm dev
   # or
   npm run dev
   ```

4. **Build for production**
   ```bash
   pnpm build
   # or
   npm run build
   ```

### Smart Contract Deployment

1. **Navigate to contract directory**
   ```bash
   cd contract
   ```

2. **Build the contracts**
   ```bash
   sui move build
   ```

3. **Run tests**
   ```bash
   sui move test
   ```

4. **Deploy to testnet**
   ```bash
   sui client publish --gas-budget 100000000
   ```

## 🎮 How to Play

1. **Connect Wallet**: Click "Connect Wallet" to link your SUI wallet
2. **Start Game**: Enter the game tab and drop fruits
3. **Merge Fruits**: Same-level fruits merge into higher-level fruits
4. **Earn Seeds**: Merging fruits earns SEED tokens
5. **Claim Rewards**: Start a claim and complete 5 more drops to harvest
6. **Farm Land**: Use seeds to plant fruits on your land
7. **Collect & Trade**: Harvest fruits, mint NFTs, and trade on the market

## 🪙 SEED Token

SEED is the in-game currency with 9 decimals (like SUI). Use it to:
- 🌱 Plant seeds on your land
- 🏠 Buy new lands
- ⬆️ Upgrade land slots
- 🧪 Purchase growth boosters
- 🔄 Perform fruit merges

## 🍎 Fruit Types

| Level | Fruit | Weight Range |
|-------|-------|--------------|
| 1 | 🍒 Cherry | 5-15g |
| 2 | 🍇 Grape | 2-5g |
| 3 | 🍊 Orange | 130-200g |
| 4 | 🍋 Lemon | 60-100g |
| 5 | 🍎 Apple | 150-250g |
| 6 | 🍐 Pear | 180-280g |
| 7 | 🍑 Peach | 120-180g |
| 8 | 🍍 Pineapple | 900-1500g |
| 9 | 🍈 Melon | 1000-2000g |
| 10 | 🍉 Watermelon | 3000-6000g |

## 🛠️ Tech Stack

### Smart Contracts
- **[Move](https://move-language.github.io/)** - Safe and secure smart contract language
- **[SUI Framework](https://docs.sui.io/)** - High-performance blockchain

### Frontend
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Vite](https://vitejs.dev/)** - Fast build tool
- **[@mysten/dapp-kit](https://sdk.mystenlabs.com/dapp-kit)** - SUI wallet integration
- **[Matter.js](https://brm.io/matter-js/)** - Physics engine for fruit dropping
- **[Three.js](https://threejs.org/)** - 3D graphics via React Three Fiber

## 📝 Available Scripts

### Frontend

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm lint` | Run ESLint |
| `pnpm preview` | Preview production build |

### Smart Contracts

| Command | Description |
|---------|-------------|
| `sui move build` | Compile contracts |
| `sui move test` | Run tests |
| `sui client publish` | Deploy to network |

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_PACKAGE_ID=your_deployed_package_id
VITE_NETWORK=testnet
```

### Contract Addresses

After deployment, update the `PACKAGE_ID` in `frontend/src/App.tsx`:

```typescript
const PACKAGE_ID = 'your_deployed_package_id'
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [SUI Network Documentation](https://docs.sui.io/)
- [Move Language Book](https://move-language.github.io/move/)
- [SUI dApp Kit](https://sdk.mystenlabs.com/dapp-kit)

---

<p align="center">
  Built with 💚 on <a href="https://sui.io/">SUI Network</a>
</p>
