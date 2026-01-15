import { useState, useEffect, useCallback } from 'react'
import { ConnectButton, useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import FruitGame from './components/FruitGame'
import PlayerLand from './components/PlayerLand'
import './App.css'

const PACKAGE_ID = '0xcd19d7a5d67772d9b6d558ed1ffe0adada1092877a362dd960094a55cc66aaed'
const CLOCK_OBJECT = '0x6'

// SEED coin type for balance checking
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS = 1_000_000_000 // 9 decimals

type GameTab = 'game' | 'land'

function App() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  const [activeTab, setActiveTab] = useState<GameTab>('game')
  
  // Player objects from the new contract structure
  const [playerAccountId, setPlayerAccountId] = useState<string | null>(null)
  const [playerInventoryId, setPlayerInventoryId] = useState<string | null>(null)
  const [landId, setLandId] = useState<string | null>(null)
  const [playerSeeds, setPlayerSeeds] = useState(0)
  const [txStatus, setTxStatus] = useState('')

  // Load player objects from chain
  const loadUserObjects = useCallback(async () => {
    if (!account?.address) {
      setPlayerAccountId(null)
      setPlayerInventoryId(null)
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

      let foundAccount: string | null = null
      let foundInventory: string | null = null
      let foundLand: string | null = null

      for (const obj of objects.data) {
        if (obj.data?.type?.includes(PACKAGE_ID)) {
          if (obj.data.type.includes('PlayerAccount')) {
            foundAccount = obj.data.objectId
          }
          if (obj.data.type.includes('PlayerInventory')) {
            foundInventory = obj.data.objectId
          }
          if (obj.data.type.includes('PlayerLand')) {
            foundLand = obj.data.objectId
          }
        }
      }
      
      const seedBalance = await suiClient.getBalance({
        owner: account.address,
        coinType: SEED_COIN_TYPE,
      })
      const seeds = Math.floor(Number(seedBalance.totalBalance) / SEED_DECIMALS)
      
      setPlayerAccountId(foundAccount)
      setPlayerInventoryId(foundInventory)
      setLandId(foundLand)
      setPlayerSeeds(seeds)
    } catch (error) {
      console.error('Error loading user objects:', error)
    }
  }, [account?.address, suiClient])

  useEffect(() => {
    loadUserObjects()
  }, [loadUserObjects])

  // Create player account (entry point for new players)
  const createPlayerAccount = async () => {
    setTxStatus('🎮 Creating player account...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::player::create_player`,
      arguments: [tx.object(CLOCK_OBJECT)],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 Account created! Now create your land.')
          await loadUserObjects()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error creating player:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  const handleSeedsHarvested = (seeds: number) => {
    setPlayerSeeds(prev => prev + seeds)
    loadUserObjects()
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
          <header className="app-header">
            <div className="header-left">
              <h1>FRUIT MERGE</h1>
            </div>

            <nav className="header-nav">
              <button 
                className={activeTab === 'game' ? 'active' : ''} 
                onClick={() => setActiveTab('game')}
              >
                🎮 GAME
              </button>
              <button 
                className={activeTab === 'land' ? 'active' : ''} 
                onClick={() => setActiveTab('land')}
              >
                🌍 FARM
              </button>
            </nav>

            <div className="header-right">
              <div className="total-harvested">
                🌱 {playerSeeds.toLocaleString()} SEEDS
              </div>
              <ConnectButton />
            </div>
          </header>

          <main className="app-main">
            {activeTab === 'game' ? (
              <div className="game-container">
                <FruitGame 
                  playerAccountId={playerAccountId ?? undefined} 
                  onSeedsHarvested={handleSeedsHarvested} 
                />
              </div>
            ) : (
              <div className="land-container">
                <PlayerLand 
                  playerAccountId={playerAccountId} 
                  playerInventoryId={playerInventoryId}
                  landId={landId} 
                  playerSeeds={playerSeeds} 
                  onDataChanged={loadUserObjects} 
                />
              </div>
            )}
          </main>
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