import { useState, useEffect } from 'react'
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = '0x81079fa7dce6562c632d0de918d7a3a3e92f8840a6fd1b073fd8edb9fcdb5f6a'
const RANDOM_OBJECT = '0x8'
const CLOCK_OBJECT = '0x6'
const MAX_FRUITS = 6
const GROW_TIME_MS = 15000 // 15 seconds

const FRUITS = [
  { level: 1, emoji: '🍒', name: 'Cherry' },
  { level: 2, emoji: '🍇', name: 'Grape' },
  { level: 3, emoji: '🍊', name: 'Orange' },
  { level: 4, emoji: '🍋', name: 'Lemon' },
  { level: 5, emoji: '🍎', name: 'Apple' },
  { level: 6, emoji: '🍐', name: 'Pear' },
  { level: 7, emoji: '🍑', name: 'Peach' },
  { level: 8, emoji: '🍍', name: 'Pineapple' },
  { level: 9, emoji: '🍈', name: 'Melon' },
  { level: 10, emoji: '🍉', name: 'Watermelon' },
]

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
const RARITY_COLORS = ['#95a5a6', '#3498db', '#9b59b6', '#e74c3c', '#f39c12']

interface PlantedFruit {
  id: string
  fruitType: number
  rarity: number
  weight: number
  plantedAt: number
  isReady: boolean
}

interface SeedBag {
  id: string
  seeds: number
}

interface PlayerLandProps {
  landId: string | null
  onLandCreated?: (landId: string) => void
}

export default function PlayerLand({ landId, onLandCreated }: PlayerLandProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  
  const [plantedFruits, setPlantedFruits] = useState<PlantedFruit[]>([])
  const [seedsOnLand, setSeedsOnLand] = useState(0)
  const [seedBags, setSeedBags] = useState<SeedBag[]>([])
  const [selectedBag, setSelectedBag] = useState<string | null>(null)
  const [seedsToPlant, setSeedsToPlant] = useState(1)
  const [txStatus, setTxStatus] = useState('')
  const [lands, setLands] = useState<string[]>([])
  const [currentTime, setCurrentTime] = useState(Date.now())

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch all user objects including lands
  const fetchUserData = async () => {
    if (!account?.address) return
    
    try {
      const objects = await suiClient.getOwnedObjects({
        owner: account.address,
        options: { showType: true, showContent: true },
      })

      const bags: SeedBag[] = []
      const userLands: string[] = []
      
      for (const obj of objects.data) {
        // Only use objects from CURRENT package (ignore old versions)
        if (!obj.data?.type?.includes(PACKAGE_ID)) continue
        
        if (obj.data.type.includes('SeedBag')) {
          const content = obj.data.content
          if (content && 'fields' in content) {
            bags.push({
              id: obj.data.objectId,
              seeds: Number((content.fields as { seeds: string }).seeds || 0)
            })
          }
        }
        if (obj.data.type.includes('PlayerLand')) {
          userLands.push(obj.data.objectId)
        }
      }
      setSeedBags(bags)
      setLands(userLands)
      if (bags.length > 0 && !selectedBag) {
        setSelectedBag(bags[0].id)
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
  }

  // Fetch land data from chain
  const fetchLandData = async () => {
    if (!landId) return
    
    try {
      const landObject = await suiClient.getObject({
        id: landId,
        options: { showContent: true }
      })
      
      if (landObject.data?.content?.dataType === 'moveObject') {
        const fields = landObject.data.content.fields as Record<string, unknown>
        setSeedsOnLand(Number(fields.seeds_balance || 0))
        
        // Parse planted fruits
        const planted = fields.planted_fruits as Array<Record<string, unknown>> || []
        setPlantedFruits(planted.map((f, idx) => {
          const fFields = (f.fields as Record<string, unknown>) || f
          return {
            id: `planted-${idx}`,
            fruitType: Number(fFields.fruit_type || 1),
            rarity: Number(fFields.rarity || 1),
            weight: Number(fFields.weight || 100),
            plantedAt: Number(fFields.planted_at || 0),
            isReady: Boolean(fFields.is_ready || false),
          }
        }))
      }
    } catch (error) {
      console.error('Error fetching land data:', error)
    }
  }

  useEffect(() => {
    fetchUserData()
    fetchLandData()
  }, [landId, account?.address])

  // Create first land FREE
  const createLandOnChain = async () => {
    setTxStatus('Creating land...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::create_land`,
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          const txDetails = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showObjectChanges: true }
          })
          
          const created = txDetails.objectChanges?.find(
            (change) => change.type === 'created' && 
            'objectType' in change && 
            change.objectType.includes('PlayerLand')
          )
          
          if (created && 'objectId' in created) {
            onLandCreated?.(created.objectId)
            setTxStatus('🎉 Land created!')
            fetchUserData()
          }
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error creating land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Buy additional land for 0.01 SUI
  const buyLandOnChain = async () => {
    setTxStatus('Buying land for 0.01 SUI...')
    const tx = new Transaction()
    
    // Split 0.01 SUI for payment
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(10_000_000)]) // 0.01 SUI
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::buy_land`,
      arguments: [coin],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          const txDetails = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showObjectChanges: true }
          })
          
          const created = txDetails.objectChanges?.find(
            (change) => change.type === 'created' && 
            'objectType' in change && 
            change.objectType.includes('PlayerLand')
          )
          
          if (created && 'objectId' in created) {
            setTxStatus('🎉 New land purchased!')
            fetchUserData()
          }
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error buying land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Transfer seeds from SeedBag to Land (fixed - no amount arg)
  const transferSeedsToLand = async () => {
    if (!selectedBag || !landId) return
    
    const bag = seedBags.find(b => b.id === selectedBag)
    if (!bag) return
    
    setTxStatus('Transferring seeds...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::transfer_seeds_from_bag`,
      arguments: [
        tx.object(selectedBag),
        tx.object(landId),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus(`✅ Transferred ${bag.seeds} seeds to land!`)
          fetchUserData()
          fetchLandData()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error transferring seeds:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Plant seeds on-chain
  const plantSeedsOnChain = async () => {
    if (!landId || seedsToPlant <= 0 || seedsToPlant > seedsOnLand) return
    if (plantedFruits.length >= MAX_FRUITS) {
      setTxStatus('❌ Land is full! Max 6 fruits.')
      setTimeout(() => setTxStatus(''), 3000)
      return
    }
    
    setTxStatus('🌱 Planting seeds...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_seeds`,
      arguments: [
        tx.object(landId),
        tx.pure.u64(seedsToPlant),
        tx.object(CLOCK_OBJECT),
        tx.object(RANDOM_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          const txDetails = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showEvents: true }
          })
          
          // Parse event to get fruit info
          const plantEvent = txDetails.events?.find(
            e => e.type.includes('FruitPlanted')
          )
          
          if (plantEvent) {
            const parsed = plantEvent.parsedJson as Record<string, unknown>
            setTxStatus(`🌳 Grew ${FRUITS[Number(parsed.fruit_type) - 1]?.name}! ${RARITIES[Number(parsed.rarity) - 1]}`)
          } else {
            setTxStatus('🌱 Seed planted!')
          }
          
          fetchLandData()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error planting:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  const totalBagSeeds = seedBags.reduce((acc, bag) => acc + bag.seeds, 0)

  return (
    <div className="player-land">
      <h2>🌍 Your Farm</h2>
      
      {/* Transaction Status */}
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}

      {/* Seed Bags Overview */}
      <div className="seed-bags-section">
        <h4>🌱 Your Seed Bags</h4>
        {seedBags.length === 0 ? (
          <p className="empty-info">No seeds yet. Play the game to earn seeds!</p>
        ) : (
          <div className="seed-bags-list">
            {seedBags.map(bag => (
              <div 
                key={bag.id} 
                className={`seed-bag ${selectedBag === bag.id ? 'selected' : ''}`}
                onClick={() => setSelectedBag(bag.id)}
              >
                <span className="bag-emoji">🎒</span>
                <span className="bag-seeds">{bag.seeds} seeds</span>
              </div>
            ))}
            <div className="total-seeds">
              Total: {totalBagSeeds} seeds
            </div>
          </div>
        )}
      </div>

      {/* No Land - Create Button */}
      {!landId && (
        <div className="create-land-prompt">
          <h3>🏡 No Land Yet</h3>
          <p>Create your land to start farming!</p>
          <button className="btn-create-land" onClick={createLandOnChain} disabled={isPending}>
            {isPending ? 'Creating...' : '🌍 Create Land'}
          </button>
        </div>
      )}

      {/* Land Active */}
      {landId && (
        <>
          {/* Land Stats */}
          <div className="land-stats">
            <div className="stat">
              <span className="stat-label">🌱 Seeds</span>
              <span className="stat-value">{seedsOnLand}</span>
            </div>
            <div className="stat">
              <span className="stat-label">🌳 Fruits</span>
              <span className="stat-value">{plantedFruits.length}/{MAX_FRUITS}</span>
            </div>
            <div className="stat">
              <span className="stat-label">🏡 Lands</span>
              <span className="stat-value">{lands.length}</span>
            </div>
          </div>

          {/* Buy More Land */}
          {plantedFruits.length >= MAX_FRUITS && (
            <div className="buy-land-prompt">
              <p>🏡 Land full! Buy more land to plant more fruits.</p>
              <button onClick={buyLandOnChain} disabled={isPending}>
                {isPending ? 'Buying...' : '💰 Buy Land (0.01 SUI)'}
              </button>
            </div>
          )}

          {/* Transfer Seeds from Bag to Land */}
          {seedBags.length > 0 && selectedBag && (
            <div className="transfer-controls">
              <button onClick={transferSeedsToLand} disabled={isPending}>
                {isPending ? 'Transferring...' : `📦 Transfer Seeds to Land`}
              </button>
            </div>
          )}

          {/* Plant Seeds Control */}
          {seedsOnLand > 0 && (
            <div className="plant-controls">
              <h4>🌱 Plant Seeds</h4>
              <div className="control-row">
                <input
                  type="number"
                  min="1"
                  max={seedsOnLand}
                  value={seedsToPlant}
                  onChange={(e) => setSeedsToPlant(Math.max(1, Math.min(seedsOnLand, parseInt(e.target.value) || 1)))}
                />
                <button onClick={plantSeedsOnChain} disabled={isPending || seedsOnLand < 1}>
                  {isPending ? 'Planting...' : '🌱 Plant'}
                </button>
              </div>
              <small>💡 More seeds = higher chance for rare fruits!</small>
            </div>
          )}

          {/* Planted Fruits Grid */}
          <div className="planted-section">
            <h4>🌳 Your Fruits ({plantedFruits.length}/{MAX_FRUITS})</h4>
            <div className="planted-grid">
              {plantedFruits.length === 0 ? (
                <p className="empty-info">No fruits yet. Plant some seeds!</p>
              ) : (
                plantedFruits.map((fruit) => {
                  const timeSincePlant = currentTime - fruit.plantedAt
                  const isGrowing = fruit.plantedAt > 0 && timeSincePlant < GROW_TIME_MS
                  const timeLeft = Math.max(0, Math.ceil((GROW_TIME_MS - timeSincePlant) / 1000))
                  
                  return (
                    <div
                      key={fruit.id}
                      className={`planted-fruit ${isGrowing ? 'growing' : 'ready'}`}
                      style={{ borderColor: RARITY_COLORS[fruit.rarity - 1] }}
                    >
                      {isGrowing ? (
                        <>
                          <span className="fruit-emoji growing-emoji">🌱</span>
                          <span className="grow-timer">⏱️ {timeLeft}s</span>
                        </>
                      ) : (
                        <>
                          <span className="fruit-emoji">{FRUITS[fruit.fruitType - 1]?.emoji || '🍎'}</span>
                          <span className="fruit-name">{FRUITS[fruit.fruitType - 1]?.name || 'Fruit'}</span>
                          <span className="fruit-rarity" style={{ color: RARITY_COLORS[fruit.rarity - 1] }}>
                            {RARITIES[fruit.rarity - 1]}
                          </span>
                          <span className="fruit-weight">{fruit.weight}g</span>
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
