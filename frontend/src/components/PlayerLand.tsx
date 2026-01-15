import { useState, useEffect, useCallback } from 'react'
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = '0xa99401dc6d117667a13b8c923954fbb7b3726bedb47440699ebc23e9ebb9377b'
const RANDOM_OBJECT = '0x8'
const CLOCK_OBJECT = '0x6'
const GROW_TIME_MS = 15000 // 15 seconds

// Pinata IPFS gateway base URL
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs'

const FRUITS = [
  { level: 1, image: `${IPFS_GATEWAY}/bafkreicydu6guwunucel3v5miduloc62s5pjsyirh5pxw5zjrnzcgdsap4`, name: 'Cherry' },
  { level: 2, image: `${IPFS_GATEWAY}/bafkreifvpkhlj53igt66rcyzylffbfbcdl7nqfqypxdjrxvhpwl3rmpgu4`, name: 'Grape' },
  { level: 3, image: `${IPFS_GATEWAY}/bafkreibenssqrrj3ctd6bfuycn66ozwrtzt23b3atwegjnt5wkqcnfrndi`, name: 'Orange' },
  { level: 4, image: `${IPFS_GATEWAY}/bafkreiarh47cw5m442fh76qkaws23uk7ztte5wyswqi2qnbgje5pkrcfme`, name: 'Lemon' },
  { level: 5, image: `${IPFS_GATEWAY}/bafkreibz6wuhdung3neha7jyyf7323qgjrtsvi3y5bixqtk32hawzvf35i`, name: 'Apple' },
  { level: 6, image: `${IPFS_GATEWAY}/bafkreifkvji2k4oyyxo3fyggkn5dvbuouvip765jk5kfa6ewt37tqkwda4`, name: 'Pear' },
  { level: 7, image: `${IPFS_GATEWAY}/bafkreihz77f36frdk7nq332g7zblwt2ctca4cvrr53awr6rybtlp56ohvy`, name: 'Peach' },
  { level: 8, image: `${IPFS_GATEWAY}/bafkreigkdamx6cylhgcthhrhx5p4rb4otkybrhyvsprvk2huyrnxrm2uya`, name: 'Pineapple' },
  { level: 9, image: `${IPFS_GATEWAY}/bafkreifefcjgleils74ujmmjlqakteiwaiotxc4sioeyrkkeul6wmqfka4`, name: 'Melon' },
  { level: 10, image: `${IPFS_GATEWAY}/bafybeib4oogwh4auyotbqfcp4bxj4qcjw4xq5htpuafbyjeifuu3dcfkha`, name: 'Watermelon' },
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
  playerAccountId: string | null
  playerInventoryId: string | null
  landId: string | null
  playerSeeds: number
  onDataChanged?: () => void
}

export default function PlayerLand({ 
  playerAccountId, 
  playerInventoryId, 
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
  const [inventory, setInventory] = useState<InventoryFruit[]>([])
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
                seedsUsed: Number(slotData.seeds_used || 1),
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

  // Fetch inventory data
  const fetchInventoryData = useCallback(async () => {
    if (!playerInventoryId) return
    
    try {
      const invObj = await suiClient.getObject({
        id: playerInventoryId,
        options: { showContent: true }
      })
      
      if (invObj.data?.content && 'fields' in invObj.data.content) {
        const fields = invObj.data.content.fields as Record<string, unknown>
        const fruits = fields.fruits as Array<{
          fields?: {
            fruit_type?: number
            rarity?: number
            weight?: number
            harvested_at?: string
          }
        }> || []
        
        const parsedFruits: InventoryFruit[] = fruits.map(f => ({
          fruitType: Number(f.fields?.fruit_type || 1),
          rarity: Number(f.fields?.rarity || 1),
          weight: Number(f.fields?.weight || 100),
          harvestedAt: Number(f.fields?.harvested_at || 0),
        }))
        setInventory(parsedFruits)
      }
    } catch (error) {
      console.error('Error fetching inventory:', error)
    }
  }, [playerInventoryId, suiClient])

  useEffect(() => {
    fetchLandData()
    fetchInventoryData()
  }, [fetchLandData, fetchInventoryData])

  // Create first land (for new players)
  const createFirstLand = async () => {
    if (!playerAccountId) return
    
    setTxStatus('🏡 Creating your first land...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::create_first_land`,
      arguments: [
        tx.object(playerAccountId),
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
    if (!playerAccountId) return
    
    setTxStatus('🏡 Buying new land...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::buy_new_land`,
      arguments: [
        tx.object(playerAccountId),
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
    if (!playerAccountId || !landId) return
    
    setTxStatus('⬆️ Upgrading land...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::upgrade_land`,
      arguments: [
        tx.object(playerAccountId),
        tx.object(landId),
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
    console.log('plantInSlot called', { playerAccountId, landId, playerInventoryId, plantSlotIndex, seedsToPlant })
    
    if (!playerAccountId) {
      setTxStatus('❌ Player account not found')
      return
    }
    if (!landId) {
      setTxStatus('❌ Land not found')
      return
    }
    if (!playerInventoryId) {
      setTxStatus('❌ Inventory not found')
      return
    }
    if (plantSlotIndex === null) {
      setTxStatus('❌ No slot selected')
      return
    }
    if (playerSeeds < seedsToPlant) {
      setTxStatus(`❌ Not enough seeds! You have ${playerSeeds}, need ${seedsToPlant}`)
      return
    }
    
    setTxStatus(`🌱 Planting ${seedsToPlant} seeds in slot ${plantSlotIndex + 1}...`)
    setShowPlantModal(false)
    
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_in_slot`,
      arguments: [
        tx.object(playerAccountId),
        tx.object(landId),
        tx.object(playerInventoryId),
        tx.pure.u64(plantSlotIndex),
        tx.pure.u64(seedsToPlant),
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
          fetchInventoryData()
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
    console.log('plantAll called', { playerAccountId, landId, playerInventoryId, batchSeeds })
    
    if (!playerAccountId) {
      setTxStatus('❌ Player account not found')
      return
    }
    if (!landId) {
      setTxStatus('❌ Land not found')
      return
    }
    if (!playerInventoryId) {
      setTxStatus('❌ Inventory not found')
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
    
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_all`,
      arguments: [
        tx.object(playerAccountId),
        tx.object(landId),
        tx.object(playerInventoryId),
        tx.pure.u64(batchSeeds),
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
          fetchInventoryData()
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
    if (!landId || !playerInventoryId) return
    
    setTxStatus('🌾 Harvesting ready fruits...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::harvest_ready`,
      arguments: [
        tx.object(landId),
        tx.object(playerInventoryId),
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
          fetchInventoryData()
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
    if (!playerAccountId) return
    
    setTxStatus('🌱 Minting 100 test seeds...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::player::mint_seeds`,
      arguments: [
        tx.object(playerAccountId),
        tx.pure.u64(100),
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
    console.log('handleSlotClick', { slot, playerSeeds, playerAccountId, landId, playerInventoryId })
    
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
      if (isReady && playerInventoryId) {
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
          {playerAccountId && (
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
      {!landId && playerAccountId && (
        <div className="create-land-prompt">
          <h3>🏡 No Land Yet</h3>
          <p>Create your first land for FREE!</p>
          <button onClick={createFirstLand} disabled={isPending}>
            {isPending ? 'Creating...' : '🌱 Create First Land'}
          </button>
        </div>
      )}

      {/* No PlayerAccount */}
      {!playerAccountId && (
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
            {readySlots > 0 && playerInventoryId && (
              <button onClick={forceHarvest} disabled={isPending}>
                🌾 Harvest All ({readySlots} ready)
              </button>
            )}
            <button 
              onClick={upgradeLand} 
              disabled={isPending || !playerAccountId}
              title="Costs seeds to upgrade"
            >
              ⬆️ Upgrade Land (costs seeds)
            </button>
            <button 
              onClick={buyNewLand} 
              disabled={isPending || !playerAccountId}
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
                      <img src={FRUITS[slot.fruit.fruitType - 1]?.image} alt={FRUITS[slot.fruit.fruitType - 1]?.name} className="slot-fruit-img" />
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

          {/* Inventory Section */}
          {playerInventoryId && inventory.length > 0 && (
            <div className="inventory-section">
              <h4>🎒 Your Inventory ({inventory.length} fruits)</h4>
              <div className="inventory-grid">
                {inventory.map((fruit, idx) => (
                  <div key={idx} className="inventory-fruit" style={{ borderColor: RARITY_COLORS[fruit.rarity - 1] }}>
                    <img src={FRUITS[fruit.fruitType - 1]?.image} alt={FRUITS[fruit.fruitType - 1]?.name} className="inventory-fruit-img" />
                    <span className="fruit-rarity" style={{ color: RARITY_COLORS[fruit.rarity - 1] }}>
                      {RARITIES[fruit.rarity - 1]}
                    </span>
                    <span className="fruit-weight">{fruit.weight}g</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
