import { useState, useEffect, useCallback } from 'react'
import { ConnectButton, useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import FruitGame from './components/FruitGame'
import PlayerLand from './components/PlayerLand'
import Inventory from './components/Inventory'
import Market from './components/Market'
import Leaderboard from './components/Leaderboard'
import './App.css'

const PACKAGE_ID = '0x1664a15686e5eec8e9554734b7309399265a8771f10f98413bba2227a6537b30'
const CLOCK_OBJECT = '0x6'

// SEED coin type for balance checking
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS = 1_000_000_000 // 9 decimals

type GameTab = 'game' | 'land' | 'inventory' | 'market' | 'leaderboard'

function App() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  const [activeTab, setActiveTab] = useState<GameTab>('game')
  
  // Player objects (no account required)
  const [landId, setLandId] = useState<string | null>(null)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [playerSeeds, setPlayerSeeds] = useState(0)
  const [txStatus, setTxStatus] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  
  // Game state tracking
  const [isGameActive, setIsGameActive] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [pendingTab, setPendingTab] = useState<GameTab | null>(null)

  // Load player objects from chain
  const loadUserObjects = useCallback(async () => {
    if (!account?.address) {
      setLandId(null)
      setPlayerSeeds(0)
      return
    }

    try {
      // Get owned objects
      const objects = await suiClient.getOwnedObjects({
        owner: account.address,
        options: { showType: true, showContent: true },
      })

      let foundLand: string | null = null
      let foundInventory: string | null = null

      for (const obj of objects.data) {
        if (obj.data?.type?.includes(`${PACKAGE_ID}::land::PlayerLand`)) {
          foundLand = obj.data.objectId
        }
        if (obj.data?.type?.includes(`${PACKAGE_ID}::player::PlayerInventory`)) {
          foundInventory = obj.data.objectId
        }
      }
      
      const seedBalance = await suiClient.getBalance({
        owner: account.address,
        coinType: SEED_COIN_TYPE,
      })
      const seeds = Math.floor(Number(seedBalance.totalBalance) / SEED_DECIMALS)
      
      setLandId(foundLand)
      setInventoryId(foundInventory)
      setPlayerSeeds(seeds)
      setRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('Error loading user objects:', error)
    }
  }, [account?.address, suiClient])

  useEffect(() => {
    loadUserObjects()
  }, [loadUserObjects])

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

  return (
    <div className="app">
      <div className="floating-fruits">
            <span className="fruit-1">🍎</span>
            <span className="fruit-2">🍇</span>
            <span className="fruit-3">🍋</span>
          </div>
      {!account ? (
        /* --- LANDING PAGE (Pre-connection) --- */
        <div className="landing-page">
          <div className="landing-content">
            <div className="badge">SUI NETWORK • TESTNET</div>
            <h1 className="hero-title">🍉 FRUIT MERGE <span>V2.0</span></h1>
            <p className="hero-subtitle">
              The most addictive Merge-to-Earn game on the Sui ecosystem. 
              Merge fruits, harvest seeds, and build your own digital farm.
            </p>
            
            <div className="features-preview">
              <div className="f-item"><span>🎮</span> Play Game</div>
              <div className="f-item"><span>🌱</span> Earn Seeds</div>
              <div className="f-item"><span>🏡</span> Expand Farm</div>
            </div>

            <div className="big-connect-wrapper">
              <ConnectButton />
              <p className="cta-hint">Connect your Sui wallet to start your journey</p>
            </div>
          </div>
          
          
        </div>
      ) : (
        /* --- GAME INTERFACE (Post-connection) --- */
        <>
          <div className="game-layout">
            {/* Sidebar Menu */}
            <aside className="sidebar-menu">
              <div className="sidebar-header">
                <h2>🍉 FRUIT<br/>MERGE</h2>
              </div>
              <nav className="sidebar-nav">
                <button 
                  className={activeTab === 'game' ? 'active' : ''} 
                  onClick={() => handleTabChange('game')}
                >
                  <span className="icon">🎮</span>
                  <span className="label">GAME</span>
                </button>
                <button 
                  className={activeTab === 'land' ? 'active' : ''} 
                  onClick={() => handleTabChange('land')}
                >
                  <span className="icon">🌍</span>
                  <span className="label">FARM</span>
                </button>
                <button 
                  className={activeTab === 'inventory' ? 'active' : ''} 
                  onClick={() => handleTabChange('inventory')}
                >
                  <span className="icon">🎒</span>
                  <span className="label">INVENTORY</span>
                </button>
                <button 
                  className={activeTab === 'market' ? 'active' : ''} 
                  onClick={() => handleTabChange('market')}
                >
                  <span className="icon">🏪</span>
                  <span className="label">MARKET</span>
                </button>
                <button 
                  className={activeTab === 'leaderboard' ? 'active' : ''} 
                  onClick={() => handleTabChange('leaderboard')}
                >
                  <span className="icon">🏆</span>
                  <span className="label">LEADERBOARD</span>
                </button>
              </nav>
              <div className="sidebar-footer">
                <div className="seeds-display">
                  <span className="icon">🌱</span>
                  <div>
                    <div className="label">Seeds</div>
                    <div className="value">{playerSeeds.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <div className="main-content">
              <header className="top-bar">
                <div className="top-bar-right">
                  <ConnectButton />
                </div>
              </header>

              <main className="content-area">
                {(() => {
                  switch (activeTab) {
                    case 'game':
                      return (
                        <div className="game-container">
                          <FruitGame 
                            onSeedsHarvested={handleSeedsHarvested}
                            onGameStateChange={setIsGameActive}
                          />
                        </div>
                      )
                    case 'land':
                      return (
                        <div className="land-container">
                          <PlayerLand 
                            landId={landId} 
                            inventoryId={inventoryId}
                            playerSeeds={playerSeeds} 
                            onDataChanged={loadUserObjects} 
                          />
                        </div>
                      )
                    case 'market':
                      return (
                        <div className="market-wrapper">
                          <Market 
                            inventoryId={inventoryId} 
                            onUpdate={loadUserObjects} 
                            refreshTrigger={refreshTrigger} 
                          />
                        </div>
                      )
                    case 'leaderboard':
                      return (
                        <div className="leaderboard-wrapper">
                          <Leaderboard 
                            inventoryId={inventoryId} 
                            onUpdate={loadUserObjects} 
                          />
                        </div>
                      )
                    case 'inventory':
                    default:
                      return (
                        <div className="inventory-wrapper">
                          <Inventory 
                            inventoryId={inventoryId} 
                            refreshTrigger={refreshTrigger}
                            onUpdate={loadUserObjects}
                          />
                        </div>
                      )
                  }
                })()}
              </main>
            </div>
          </div>

          {/* Exit Confirmation Modal */}
          {showExitModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>⚠️ Warning</h3>
                <p>You are currently playing a game. If you switch tabs now, you will lose your current progress.</p>
                <p><strong>Do you want to exit?</strong></p>
                <div className="modal-buttons">
                  <button className="btn-cancel" onClick={cancelTabChange}>No</button>
                  <button className="btn-confirm" onClick={confirmTabChange}>Yes</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer Info */}
      <footer style={{padding: '20px', textAlign: 'center', opacity: 0.5, fontSize: '0.7rem'}}>
        SUI NETWORK • TESTNET • V2.0
      </footer>

      {/* Transaction Status Toast */}
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}
    </div>
  )
}

export default App