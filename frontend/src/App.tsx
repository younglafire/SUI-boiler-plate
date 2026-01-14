import { useState, useEffect } from 'react'
import { ConnectButton, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import FruitGame from './components/FruitGame'
import PlayerLand from './components/PlayerLand'
import './App.css'

const PACKAGE_ID = '0x81079fa7dce6562c632d0de918d7a3a3e92f8840a6fd1b073fd8edb9fcdb5f6a'

type GameTab = 'game' | 'land'

function App() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const [activeTab, setActiveTab] = useState<GameTab>('game')
  const [landId, setLandId] = useState<string | null>(null)
  const [totalSeeds, setTotalSeeds] = useState(0)

  // Load existing SeedBags and Land from chain
  useEffect(() => {
    if (!account?.address) {
      setLandId(null)
      setTotalSeeds(0)
      return
    }

    const loadUserObjects = async () => {
      try {
        const objects = await suiClient.getOwnedObjects({
          owner: account.address,
          options: { showType: true, showContent: true },
        })

        let seeds = 0
        let foundLand: string | null = null
        for (const obj of objects.data) {
          // Only use objects from CURRENT package (ignore old versions)
          if (obj.data?.type?.includes(PACKAGE_ID)) {
            if (obj.data.type.includes('PlayerLand')) {
              foundLand = obj.data.objectId
            }
            if (obj.data.type.includes('SeedBag')) {
              const content = obj.data?.content
              if (content && 'fields' in content) {
                seeds += Number((content.fields as { seeds: string }).seeds || 0)
              }
            }
          }
        }
        setLandId(foundLand)
        setTotalSeeds(seeds)
      } catch (error) {
        console.error('Error loading user objects:', error)
      }
    }

    loadUserObjects()
  }, [account?.address, suiClient])

  const handleLandCreated = (newLandId: string) => {
    setLandId(newLandId)
  }

  const handleSeedsHarvested = (seeds: number) => {
    setTotalSeeds(prev => prev + seeds)
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>🍉 SUI Fruit Merge</h1>
        <div className="header-right">
          {totalSeeds > 0 && (
            <span className="total-harvested">🌱 Seeds: {totalSeeds}</span>
          )}
          <ConnectButton />
        </div>
      </header>

      {/* Main content - available even without wallet! */}
      <main className="app-main">
        {/* Tab Navigation */}
        <nav className="tab-nav">
          <button
            className={activeTab === 'game' ? 'active' : ''}
            onClick={() => setActiveTab('game')}
          >
            🎮 Game
          </button>
          <button
            className={activeTab === 'land' ? 'active' : ''}
            onClick={() => setActiveTab('land')}
          >
            🌍 Land
          </button>
        </nav>

        {/* Game Tab - ALWAYS playable */}
        {activeTab === 'game' && (
          <div className="game-container">
            <FruitGame
              onSeedsHarvested={handleSeedsHarvested}
            />
          </div>
        )}

        {/* Land Tab */}
        {activeTab === 'land' && (
          <div className="land-container">
            {account ? (
              <PlayerLand
                landId={landId}
                onLandCreated={handleLandCreated}
              />
            ) : (
              <div className="connect-prompt-small">
                <p>🔗 Connect wallet to manage your land</p>
                <ConnectButton />
              </div>
            )}
          </div>
        )}

        {/* Blockchain Info */}
        <div className="blockchain-info">
          <small>
            📦 Package: <a href={`https://suiscan.xyz/testnet/object/${PACKAGE_ID}`} target="_blank" rel="noopener noreferrer">
              {PACKAGE_ID.slice(0, 10)}...
            </a>
          </small>
        </div>
      </main>
    </div>
  )
}

export default App
