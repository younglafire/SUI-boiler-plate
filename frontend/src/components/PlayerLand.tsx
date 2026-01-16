import { useState, useEffect, useCallback } from 'react'
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = '0xebb2a971f21d87770364ed9bf697357045add4ec3b113f05bf61f2460230726d'
const RANDOM_OBJECT = '0x8'
const CLOCK_OBJECT = '0x6'
const GROW_TIME_MS = 15000 // 15 seconds

// SeedAdminCap shared object ID (from contract publish)
const SEED_ADMIN_CAP = '0x1928336a338b80e7a24c442d95848bef46e954fd860c1dc19e055f3f6d7a6433'

// SEED coin type and decimals
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS = 1_000_000_000n

// Costs in whole SEED tokens
const NEW_LAND_COST = 500n
const LAND_UPGRADE_BASE_COST = 100n

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
  fruitType: number
  rarity: number
  weight: number
  seedsUsed: number
  plantedAt: number
}

interface Slot {
  index: number
  fruit: PlantedFruit | null
}

interface InventoryFruit {
  fruitType: number
  rarity: number
  weight: number
  harvestedAt: number
}

interface PlayerLandProps {
  landId: string | null
  playerSeeds: number
  onDataChanged?: () => void
}

export default function PlayerLand({ 
  landId, 
  playerSeeds,
  onDataChanged 
}: PlayerLandProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  
  const [slots, setSlots] = useState<Slot[]>([])
  const [landLevel, setLandLevel] = useState(1)
  const [maxSlots, setMaxSlots] = useState(4)
  const [txStatus, setTxStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  // Modal states
  const [showPlantModal, setShowPlantModal] = useState(false)
  const [plantSlotIndex, setPlantSlotIndex] = useState<number | null>(null)
  const [seedsToPlant, setSeedsToPlant] = useState(1)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchSeeds, setBatchSeeds] = useState(1)

  // Suppress unused variable warning
  void account

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch land data
  const fetchLandData = useCallback(async () => {
    if (!landId) return
    
    try {
      const landObj = await suiClient.getObject({
        id: landId,
        options: { showContent: true }
      })
      
      if (landObj.data?.content && 'fields' in landObj.data.content) {
        const fields = landObj.data.content.fields as Record<string, unknown>
        
        setLandLevel(Number(fields.level || 1))
        setMaxSlots(Number(fields.max_slots || 4))
        
        // Parse slots
        const slotsData = fields.slots as Array<{
          fields?: {
            fruit_type?: number
            rarity?: number
            weight?: number
            seeds_used?: number
            planted_at?: string
          } | null
        } | null> || []
        
        const parsedSlots: Slot[] = []
        for (let i = 0; i < slotsData.length; i++) {
          const slotOption = slotsData[i]
          if (slotOption && 'fields' in slotOption && slotOption.fields) {
            const slotData = slotOption.fields
            parsedSlots.push({
              index: i,
              fruit: {
                fruitType: Number(slotData.fruit_type || 1),
                rarity: Number(slotData.rarity || 1),
                weight: Number(slotData.weight || 100),
                seedsUsed: Math.floor(Number(slotData.seeds_used || 1) / Number(SEED_DECIMALS)),
                plantedAt: Number(slotData.planted_at || 0),
              }
            })
          } else {
            parsedSlots.push({ index: i, fruit: null })
          }
        }
        setSlots(parsedSlots)
      }
    } catch (error) {
      console.error('Error fetching land data:', error)
    }
  }, [landId, suiClient])

  // Fetch inventory data - REMOVED (no player inventory needed)
  // Users interact directly with harvested fruits without storage

  useEffect(() => {
    fetchLandData()
  }, [fetchLandData])

  // Create first land (for new players)
  const createFirstLand = async () => {
    setTxStatus('🏡 Creating your first land...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::create_first_land`,
      arguments: [
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 Land created!')
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error creating land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Buy additional land
  const buyNewLand = async () => {
    if (!account?.address) return
    
    const costInSeeds = Number(NEW_LAND_COST)
    if (playerSeeds < costInSeeds) {
      setTxStatus(`❌ Not enough seeds! Need ${costInSeeds} SEED`)
      return
    }
    
    setTxStatus('🏡 Buying new land...')
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split exact amount needed from merged coin
    const cost = NEW_LAND_COST * SEED_DECIMALS
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(cost)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::buy_new_land`,
      arguments: [
        payment,
        tx.sharedObjectRef({
          objectId: SEED_ADMIN_CAP,
          mutable: true,
          initialSharedVersion: 731570534,
        }),
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 New land purchased!')
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error buying land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Upgrade land to get more slots
  const upgradeLand = async () => {
    if (!landId || !account?.address) return
    
    // Cost doubles with each level: 100, 200, 400, 800...
    const costInSeeds = Number(LAND_UPGRADE_BASE_COST) * (1 << landLevel)
    if (playerSeeds < costInSeeds) {
      setTxStatus(`❌ Not enough seeds! Need ${costInSeeds} SEED`)
      return
    }
    
    setTxStatus('⬆️ Upgrading land...')
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split the required amount
    const cost = LAND_UPGRADE_BASE_COST * BigInt(1 << landLevel) * SEED_DECIMALS
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(cost)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::upgrade_land`,
      arguments: [
        tx.object(landId),
        payment,
        tx.sharedObjectRef({
          objectId: SEED_ADMIN_CAP,
          mutable: true,
          initialSharedVersion: 731570534,
        }),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 Land upgraded!')
          fetchLandData()
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error upgrading land:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Plant in single slot
  const plantInSlot = async () => {
    console.log('plantInSlot called', { landId, plantSlotIndex, seedsToPlant })
    
    if (!landId) {
      setTxStatus('❌ Land not found')
      return
    }
    if (plantSlotIndex === null) {
      setTxStatus('❌ No slot selected')
      return
    }
    if (!account?.address) {
      setTxStatus('❌ Wallet not connected')
      return
    }
    if (playerSeeds < seedsToPlant) {
      setTxStatus(`❌ Not enough seeds! You have ${playerSeeds}, need ${seedsToPlant}`)
      return
    }
    
    setTxStatus(`🌱 Planting ${seedsToPlant} seeds in slot ${plantSlotIndex + 1}...`)
    setShowPlantModal(false)
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split the required amount (with decimals)
    const amountWithDecimals = BigInt(seedsToPlant) * SEED_DECIMALS
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(amountWithDecimals)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_in_slot`,
      arguments: [
        tx.object(landId),
        tx.pure.u64(plantSlotIndex),
        payment,
        tx.sharedObjectRef({
          objectId: SEED_ADMIN_CAP,
          mutable: true,
          initialSharedVersion: 731570534,
        }),
        tx.object(CLOCK_OBJECT),
        tx.object(RANDOM_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🌳 Seed planted!')
          fetchLandData()
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error planting:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Plant all empty slots
  const plantAll = async () => {
    console.log('plantAll called', { landId, batchSeeds })
    
    if (!account) {
      setTxStatus('❌ Please connect your wallet first')
      return
    }
    if (!landId) {
      setTxStatus('❌ Land not found')
      return
    }
    if (!account?.address) {
      setTxStatus('❌ Wallet not connected')
      return
    }
    
    const emptyCount = slots.filter(s => !s.fruit).length
    if (emptyCount === 0) {
      setTxStatus('No empty slots!')
      return
    }
    
    const totalNeeded = batchSeeds * emptyCount
    if (playerSeeds < totalNeeded) {
      setTxStatus(`❌ Not enough seeds! You have ${playerSeeds}, need ${totalNeeded}`)
      return
    }
    
    setTxStatus(`🌱 Planting ${batchSeeds} seeds in ${emptyCount} slots...`)
    setShowBatchModal(false)
    
    // Get all SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge all coins into first one if multiple coins exist
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Total amount needed (with decimals)
    const totalAmountWithDecimals = BigInt(totalNeeded) * SEED_DECIMALS
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(totalAmountWithDecimals)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_all`,
      arguments: [
        tx.object(landId),
        payment,
        tx.pure.u64(batchSeeds), // Don't multiply by decimals - payment already has it
        tx.sharedObjectRef({
          objectId: SEED_ADMIN_CAP,
          mutable: true,
          initialSharedVersion: 731570534,
        }),
        tx.object(CLOCK_OBJECT),
        tx.object(RANDOM_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus(`🌳 Planted in ${emptyCount} slots!`)
          fetchLandData()
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error batch planting:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Force harvest (triggers auto-harvest)
  const forceHarvest = async () => {
    if (!landId || !inventoryId) {
      if (!inventoryId) setTxStatus('Wait for inventory to load...')
      return
    }
    
    setTxStatus('🌾 Harvesting ready fruits...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::harvest_ready`,
      arguments: [
        tx.object(landId),
        tx.object(inventoryId),
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🍎 Fruits harvested to inventory!')
          fetchLandData()
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error harvesting:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Mint test seeds (for testing/hackathon)
  const mintTestSeeds = async () => {
    setTxStatus('🌱 Minting 100 test seeds...')
    const tx = new Transaction()
    
    // Multiply by 10^9 for 9 decimals
    const amountWithDecimals = 100n * SEED_DECIMALS
    
    tx.moveCall({
      target: `${PACKAGE_ID}::player::mint_seeds`,
      arguments: [
        tx.sharedObjectRef({
          objectId: SEED_ADMIN_CAP,
          mutable: true,
          initialSharedVersion: 731570534,
        }),
        tx.pure.u64(amountWithDecimals),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎉 Got 100 seeds!')
          onDataChanged?.()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error minting seeds:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  const emptySlots = slots.filter(s => !s.fruit).length
  const readySlots = slots.filter(s => s.fruit && currentTime >= s.fruit.plantedAt + GROW_TIME_MS).length

  // Click on empty slot
  const handleSlotClick = (slot: Slot) => {
    console.log('handleSlotClick', { slot, playerSeeds, landId })
    
    if (!slot.fruit) {
      // Empty slot - open plant modal
      if (playerSeeds > 0) {
        console.log('Opening plant modal for slot', slot.index)
        setPlantSlotIndex(slot.index)
        setSeedsToPlant(1)
        setShowPlantModal(true)
      } else {
        setTxStatus('❌ You need seeds! Play the game or mint test seeds.')
        setTimeout(() => setTxStatus(''), 3000)
      }
    } else {
      // Has fruit - check if ready, trigger harvest
      const isReady = currentTime >= slot.fruit.plantedAt + GROW_TIME_MS
      if (isReady) {
        forceHarvest()
      } else {
        const timeLeft = Math.max(0, Math.ceil((slot.fruit.plantedAt + GROW_TIME_MS - currentTime) / 1000))
        setTxStatus(`⏱️ Still growing... ${timeLeft}s left`)
        setTimeout(() => setTxStatus(''), 2000)
      }
    }
  }

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

      {/* Seeds Overview */}
      <div className="seeds-section">
        <div className="seeds-display">
          <h4>🌱 Your Seeds: {playerSeeds}</h4>
          {account && (
            <button 
              onClick={mintTestSeeds} 
              disabled={isPending}
              className="mint-test-btn"
              title="Mint 100 test seeds"
            >
              {isPending ? '⏳' : '+ Mint Test Seeds'}
            </button>
          )}
        </div>
      </div>

      {/* No Land */}
      {!landId && account && (
        <div className="create-land-prompt">
          <h3>🏡 No Land Yet</h3>
          <p>Create your first land for FREE!</p>
          <button onClick={createFirstLand} disabled={isPending}>
            {isPending ? 'Creating...' : '🌱 Create First Land'}
          </button>
        </div>
      )}

      {/* No PlayerAccount */}
      {!account && (
        <div className="create-account-prompt">
          <h3>🎮 Create Account First</h3>
          <p>You need to create a player account before getting land.</p>
        </div>
      )}

      {/* Has Land */}
      {landId && (
        <>
          {/* Land Info */}
          <div className="land-info">
            <span>Level {landLevel}</span>
            <span>{maxSlots} slots</span>
          </div>

          {/* Action Buttons */}
          <div className="land-actions">
            {emptySlots > 0 && (
              <button 
                onClick={() => {
                  if (playerSeeds === 0) {
                    setTxStatus('❌ You need seeds first! Play the game or mint test seeds.')
                    setTimeout(() => setTxStatus(''), 3000)
                    return
                  }
                  setShowBatchModal(true)
                }} 
                disabled={isPending}
                className={playerSeeds > 0 ? '' : 'disabled-hint'}
              >
                🌱 Plant All ({emptySlots} slots) {playerSeeds === 0 && '- Need seeds!'}
              </button>
            )}
            {readySlots > 0 && (
              <button onClick={forceHarvest} disabled={isPending}>
                🌾 Harvest All ({readySlots} ready)
              </button>
            )}
            <button 
              onClick={upgradeLand} 
              disabled={isPending || !account}
              title="Costs seeds to upgrade"
            >
              ⬆️ Upgrade Land (costs seeds)
            </button>
            <button 
              onClick={buyNewLand} 
              disabled={isPending || !account}
              title="Costs seeds to buy new land"
            >
              🏡 Buy New Land (costs seeds)
            </button>
          </div>

          {/* Slots Grid */}
          <div className="slots-grid">
            {slots.map((slot) => {
              const isReady = slot.fruit && currentTime >= slot.fruit.plantedAt + GROW_TIME_MS
              const timeLeft = slot.fruit ? Math.max(0, Math.ceil((slot.fruit.plantedAt + GROW_TIME_MS - currentTime) / 1000)) : 0
              
              return (
                <div
                  key={slot.index}
                  className={`slot ${!slot.fruit ? 'empty' : isReady ? 'ready' : 'growing'}`}
                  onClick={() => handleSlotClick(slot)}
                >
                  {!slot.fruit ? (
                    <div className="slot-empty">
                      <span className="slot-icon">➕</span>
                      <span className="slot-label">Plant</span>
                    </div>
                  ) : isReady ? (
                    <div className="slot-ready">
                      <div className="slot-fruit-emoji">{FRUITS[slot.fruit.fruitType - 1]?.emoji}</div>
                      <span className="slot-name">{FRUITS[slot.fruit.fruitType - 1]?.name}</span>
                      <span className="slot-rarity" style={{ color: RARITY_COLORS[slot.fruit.rarity - 1] }}>
                        {RARITIES[slot.fruit.rarity - 1]}
                      </span>
                      <span className="slot-harvest">🌾 Tap to Harvest</span>
                    </div>
                  ) : (
                    <div className="slot-growing">
                      <span className="slot-emoji growing-anim">🌱</span>
                      <span className="slot-timer">⏱️ {timeLeft}s</span>
                      <span className="slot-seeds">{slot.fruit.seedsUsed} seeds</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Plant Single Modal */}
      {showPlantModal && (
        <div className="modal-overlay" onClick={() => setShowPlantModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🌱 Plant in Slot {(plantSlotIndex ?? 0) + 1}</h3>
            <p>More seeds = higher chance for rare fruits!</p>
            <div className="modal-input">
              <label>Seeds to plant:</label>
              <input
                type="number"
                min="1"
                max={playerSeeds}
                value={seedsToPlant}
                onChange={(e) => setSeedsToPlant(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowPlantModal(false)}>Cancel</button>
              <button onClick={plantInSlot} disabled={isPending || playerSeeds < seedsToPlant}>
                🌱 Plant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Plant Modal */}
      {showBatchModal && (
        <div className="modal-overlay" onClick={() => setShowBatchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🌱 Plant All Empty Slots</h3>
            <p>Plant in {emptySlots} empty slots</p>
            <div className="modal-input">
              <label>Seeds per slot:</label>
              <input
                type="number"
                min="1"
                max={Math.floor(playerSeeds / emptySlots)}
                value={batchSeeds}
                onChange={(e) => setBatchSeeds(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <p className="modal-total">Total: {batchSeeds * emptySlots} seeds</p>
            <div className="modal-actions">
              <button onClick={() => setShowBatchModal(false)}>Cancel</button>
              <button onClick={plantAll} disabled={isPending || playerSeeds < batchSeeds * emptySlots}>
                🌱 Plant All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
