import { useState, useEffect, useCallback } from 'react'
import { ConnectButton, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'

// Import Trang con
import FruitGame from './components/FruitGame'
import PlayerLand from './components/PlayerLand'
import Inventory from './components/Inventory'
import Market from './components/Market'
import Leaderboard from './components/Leaderboard'

// Import bộ 9 file CSS Modular (Đảm bảo ní đã tạo các file này trong thư mục styles)
import './styles/Base.css'
import './styles/Layout.css'
import './styles/Landing.css'
import './styles/Game.css'
import './styles/Farm.css'
import './styles/Inventory.css'
import './styles/Market.css'
import './styles/Leaderboard.css'
import './styles/Components.css'

// Import Assets - Fruits
import imgApple from './assets/fruit/Táo.png'
import imgGrape from './assets/fruit/Nho.png'
import imgLemon from './assets/fruit/Chanh.png'
import imgWatermelon from './assets/fruit/Dưa hấu.png'
import imgPeach from './assets/fruit/Đào.png'
import imgPineapple from './assets/fruit/Thơm.png'
import imgPear from './assets/fruit/Lê.png'
import imgCherry from './assets/fruit/Cherry.png'
import imgOrange from './assets/fruit/Cam.png'
import imgSeed from './assets/Hạt 1.svg' // Using Hạt 1.svg for the seed icon

const PACKAGE_ID = '0x599868f3b4e190173c1ec1d3bd2738239461d617f74fe136a1a2f021fdf02503'
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`

type GameTab = 'game' | 'land' | 'inventory' | 'market' | 'leaderboard'

function App() {
  /* ===================================================
     LOGIC BACKEND (GIỮ NGUYÊN)
     =================================================== */
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const [activeTab, setActiveTab] = useState<GameTab>('game')
  
  const [landId, setLandId] = useState<string | null>(null)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [playerSeeds, setPlayerSeeds] = useState(0)
  const [seedScale, setSeedScale] = useState<bigint>(1_000_000_000n)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  
  const [isGameActive, setIsGameActive] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [pendingTab, setPendingTab] = useState<GameTab | null>(null)

  const loadUserObjects = useCallback(async () => {
    if (!account?.address) {
      setLandId(null)
      setPlayerSeeds(0)
      return
    }
    try {
      const objects = await suiClient.getOwnedObjects({
        owner: account.address,
        options: { showType: true, showContent: true },
      })
      let foundLand: string | null = null
      let foundInventory: string | null = null
      for (const obj of objects.data) {
        if (obj.data?.type?.includes(`${PACKAGE_ID}::land::PlayerLand`)) foundLand = obj.data.objectId
        if (obj.data?.type?.includes(`${PACKAGE_ID}::player::PlayerInventory`)) foundInventory = obj.data.objectId
      }
      const seedBalance = await suiClient.getBalance({
        owner: account.address,
        coinType: SEED_COIN_TYPE,
      })
      setLandId(foundLand)
      setInventoryId(foundInventory)
      // Divide with BigInt to avoid precision loss
      const balanceBig = BigInt(seedBalance.totalBalance)
      const scale = seedScale || 1_000_000_000n
      setPlayerSeeds(Number(balanceBig / scale))
      setRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('Error loading user objects:', error)
    }
  }, [account?.address, seedScale, suiClient])

  // Fetch coin decimals so UI uses the exact on-chain scale
  useEffect(() => {
    const fetchDecimals = async () => {
      try {
        const meta = await suiClient.getCoinMetadata({ coinType: SEED_COIN_TYPE })
        if (meta?.decimals !== undefined) {
          const scale = 10n ** BigInt(meta.decimals)
          setSeedScale(scale)
        }
      } catch (err) {
        console.warn('Using default SEED decimals (9):', err)
      }
    }
    fetchDecimals()
  }, [suiClient])

  useEffect(() => { loadUserObjects() }, [loadUserObjects])

  const handleSeedsHarvested = (seeds: number) => {
    setPlayerSeeds(prev => prev + seeds)
    loadUserObjects()
  }

  const handleTabChange = (newTab: GameTab) => {
    if (isGameActive && newTab !== activeTab) {
      setPendingTab(newTab)
      setShowExitModal(true)
    } else {
      setActiveTab(newTab)
    }
  }

  const confirmTabChange = () => {
    if (pendingTab) {
      setActiveTab(pendingTab)
      setIsGameActive(false)
      setPendingTab(null)
    }
    setShowExitModal(false)
  }

  const cancelTabChange = () => {
    setPendingTab(null)
    setShowExitModal(false)
  }

  /* ===================================================
     GIAO DIỆN JSX (VIẾT LẠI MỚI)
     =================================================== */
  return (
    <div className="app">
      {!account ? (
        /* 2. TRANG CHÀO MỪNG (Khi chưa Connect) */
        <div className="landing-page">
          {/* Sky Elements */}
          <div className="sky-container">
            <div className="sun"></div>
            <div className="cloud c1"></div>
            <div className="cloud c2"></div>
            <div className="cloud c3"></div>
          </div>

          {/* Farm Background Layers */}
          <div className="farm-hills">
            <div className="hill hill-back"></div>
            <div className="hill hill-front"></div>
          </div>
          
          <div className="floating-fruits">
            <img src={imgWatermelon} className="fruit-float f1" />
            <img src={imgPineapple} className="fruit-float f2" />
            <img src={imgGrape} className="fruit-float f3" />
            <img src={imgLemon} className="fruit-float f4" />
            <img src={imgApple} className="fruit-float f5" />
            <img src={imgPeach} className="fruit-float f6" />
            <img src={imgOrange} className="fruit-float f7" />
            <img src={imgWatermelon} className="fruit-float f8" />
            <img src={imgPear} className="fruit-float f9" />
            <img src={imgGrape} className="fruit-float f10" />
            <img src={imgCherry} className="fruit-float f11" />
            <img src={imgLemon} className="fruit-float f12" />
          </div>
          <div className="landing-content">
            <div className="badge">SUI NETWORK • TESTNET</div>
            
            {/* New Title & Vibe */}
            <h1 className="hero-title watery-text">WATERY</h1>
            
            <p className="hero-subtitle">
              Dive into the juiciest merge game on Sui! <br/>
              Merge fruits, collect seeds, and build your dream farm.
            </p>
            
            <div className="features-preview">
              <div className="f-item bounce-1"><span>🍉</span> <p>Merge</p></div>
              <div className="f-item bounce-2"><span>✨</span> <p>Collect</p></div>
              <div className="f-item bounce-3"><span>🏝️</span> <p>Farm</p></div>
            </div>

            <div className="big-connect-wrapper">
              {/* This wrapper helps us style the button as a fruit */}
              <div className="watermelon-btn-container">
                <ConnectButton className="watermelon-btn" />
              </div>
              <p className="cta-hint">Connect Wallet to Splash In!</p>
            </div>
          </div>
        </div>
      ) : (
        /* 3. GIAO DIỆN CHÍNH (Sau khi đã Connect) */
        <div className="game-layout">
          {/* SIDEBAR / BOTTOM BAR */}
          <aside className="sidebar-menu">
            <div className="sidebar-header">
              <h2>🍉 FRUIT<br/>MERGE</h2>
            </div>
            
            <nav className="sidebar-nav">
              <button className={activeTab === 'game' ? 'active' : ''} onClick={() => handleTabChange('game')}>
                <span className="icon">🎮</span><span className="label">GAME</span>
              </button>
              <button className={activeTab === 'land' ? 'active' : ''} onClick={() => handleTabChange('land')}>
                <span className="icon">🌍</span><span className="label">FARM</span>
              </button>
              <button className={activeTab === 'inventory' ? 'active' : ''} onClick={() => handleTabChange('inventory')}>
                <span className="icon">🎒</span><span className="label">BAGS</span>
              </button>
              <button className={activeTab === 'market' ? 'active' : ''} onClick={() => handleTabChange('market')}>
                <span className="icon">🏪</span><span className="label">MARKET</span>
              </button>
              <button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => handleTabChange('leaderboard')}>
                <span className="icon">🏆</span><span className="label">RANK</span>
              </button>
            </nav>

            <div className="sidebar-footer">
              <div className="seeds-display">
                <img src={imgSeed} alt="Seed icon" className="icon seed-icon" />
                <div>
                  <div className="label">Your Seeds</div>
                  <div className="value">{playerSeeds.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </aside>

          {/* NỘI DUNG CHÍNH */}
          <div className="main-content">
            <header className="top-bar">
              <div className="top-bar-right">
                <div className="seed-balance-display">
                  <img src={imgSeed} alt="SEED" className="seed-icon-small" />
                  <span className="seed-amount">{playerSeeds.toLocaleString()}</span>
                </div>
                <ConnectButton />
              </div>
            </header>

            <main className="content-area">
              {(() => {
                switch (activeTab) {
                  case 'game':
                    return <FruitGame onSeedsHarvested={handleSeedsHarvested} onGameStateChange={setIsGameActive} />
                  case 'land':
                    return <PlayerLand landId={landId} inventoryId={inventoryId} playerSeeds={playerSeeds} seedScale={seedScale} onDataChanged={loadUserObjects} />
                  case 'market':
                    return <Market inventoryId={inventoryId} onUpdate={loadUserObjects} refreshTrigger={refreshTrigger} playerSeeds={playerSeeds} />
                  case 'leaderboard':
                    return <Leaderboard inventoryId={inventoryId} onUpdate={loadUserObjects} />
                  case 'inventory':
                  default:
                    return <Inventory inventoryId={inventoryId} refreshTrigger={refreshTrigger} onUpdate={loadUserObjects} playerSeeds={playerSeeds} />
                }
              })()}
            </main>
          </div>
        </div>
      )}

      {/* 4. MODALS & NOTIFICATIONS */}
      {showExitModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>⚠️ Warning</h3>
            <p>Ní đang trong trận. Nếu chuyển tab bây giờ, mọi tiến trình chơi game sẽ bị mất trắng đó nha!</p>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={cancelTabChange}>Ở LẠI</button>
              <button className="btn-confirm" onClick={confirmTabChange}>THOÁT</button>
            </div>
          </div>
        </div>
      )}

      {account && (
        <footer className="footer-v2">
          SUI NETWORK • TESTNET • V2.0
        </footer>
      )}
    </div>
  )
}

export default App