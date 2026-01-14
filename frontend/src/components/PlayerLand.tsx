import { useState, useEffect } from 'react'
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = '0xe6d304e671b8fd270f8b5d978dfed1a9debd20ec20ea784e36fb872fa3a2b638'
const RANDOM_OBJECT = '0x8'
const CLOCK_OBJECT = '0x6'
const MAX_SLOTS = 6
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

interface SeedBag {
  id: string
  seeds: number
}

interface HarvestedFruit {
  fruitType: number
  rarity: number
  weight: number
}

interface PlayerLandProps {
  landId: string | null
  onLandCreated?: (landId: string) => void
}

export default function PlayerLand({ landId, onLandCreated }: PlayerLandProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  
  const [slots, setSlots] = useState<Slot[]>([])
  const [seedBags, setSeedBags] = useState<SeedBag[]>([])
  const [selectedBag, setSelectedBag] = useState<string | null>(null)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [inventory, setInventory] = useState<HarvestedFruit[]>([])
  const [txStatus, setTxStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  // Modal states
  const [showPlantModal, setShowPlantModal] = useState(false)
  const [plantSlotIndex, setPlantSlotIndex] = useState<number | null>(null)
  const [seedsToPlant, setSeedsToPlant] = useState(1)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchSeeds, setBatchSeeds] = useState(1)

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch all user objects
  const fetchUserData = async () => {
    if (!account?.address) return
    
    try {
      const objects = await suiClient.getOwnedObjects({
        owner: account.address,
        options: { showType: true, showContent: true },
      })

      const bags: SeedBag[] = []
      
      for (const obj of objects.data) {
        // Only use objects from CURRENT package
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
        if (obj.data.type.includes('FruitInventory')) {
          setInventoryId(obj.data.objectId)
          const content = obj.data.content
          if (content && 'fields' in content) {
            const fields = content.fields as { fruits: Array<{ fields: { fruit_type: string; rarity: string; weight: string } }> }
            setInventory((fields.fruits || []).map(f => ({
              fruitType: Number(f.fields?.fruit_type || 1),
              rarity: Number(f.fields?.rarity || 1),
              weight: Number(f.fields?.weight || 100),
            })))
          }
        }
      }
      setSeedBags(bags)
      if (bags.length > 0 && !selectedBag) {
        setSelectedBag(bags[0].id)
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
  }

  // Fetch land slots
  const fetchLandData = async () => {
    if (!landId) return
    
    try {
      const landObject = await suiClient.getObject({
        id: landId,
        options: { showContent: true }
      })
      
      if (landObject.data?.content?.dataType === 'moveObject') {
        const fields = landObject.data.content.fields as { slots: Array<{ fields?: { fruit_type: string; rarity: string; weight: string; seeds_used: string; planted_at: string } } | null> }
        
        const parsedSlots: Slot[] = []
        for (let i = 0; i < MAX_SLOTS; i++) {
          const slotData = fields.slots?.[i]
          if (slotData && slotData.fields) {
            parsedSlots.push({
              index: i,
              fruit: {
                fruitType: Number(slotData.fields.fruit_type || 1),
                rarity: Number(slotData.fields.rarity || 1),
                weight: Number(slotData.fields.weight || 100),
                seedsUsed: Number(slotData.fields.seeds_used || 1),
                plantedAt: Number(slotData.fields.planted_at || 0),
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

  // Create inventory
  const createInventoryOnChain = async () => {
    setTxStatus('Creating inventory...')
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::create_inventory`,
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🎒 Inventory created!')
          fetchUserData()
          setTimeout(() => setTxStatus(''), 2000)
        },
        onError: (error) => {
          console.error('Error creating inventory:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Plant in single slot
  const plantInSlot = async () => {
    if (!landId || !selectedBag || plantSlotIndex === null) return
    
    setTxStatus(`🌱 Planting ${seedsToPlant} seeds in slot ${plantSlotIndex + 1}...`)
    setShowPlantModal(false)
    
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_in_slot`,
      arguments: [
        tx.object(landId),
        tx.object(selectedBag),
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
          fetchUserData()
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

  // Batch plant all empty slots
  const plantBatch = async () => {
    if (!landId || !selectedBag) return
    
    const emptyCount = slots.filter(s => !s.fruit).length
    if (emptyCount === 0) {
      setTxStatus('No empty slots!')
      return
    }
    
    setTxStatus(`🌱 Planting ${batchSeeds} seeds in ${emptyCount} slots...`)
    setShowBatchModal(false)
    
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::plant_batch`,
      arguments: [
        tx.object(landId),
        tx.object(selectedBag),
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
          fetchUserData()
          fetchLandData()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error batch planting:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Harvest single slot
  const harvestSlot = async (slotIndex: number) => {
    if (!landId || !inventoryId) return
    
    setTxStatus(`🌾 Harvesting slot ${slotIndex + 1}...`)
    
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::harvest_slot`,
      arguments: [
        tx.object(landId),
        tx.object(inventoryId),
        tx.pure.u64(slotIndex),
        tx.object(CLOCK_OBJECT),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus('🍎 Fruit harvested!')
          fetchUserData()
          fetchLandData()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error harvesting:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  // Harvest all ready
  const harvestAll = async () => {
    if (!landId || !inventoryId) return
    
    setTxStatus('🌾 Harvesting all ready fruits...')
    
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::land::harvest_all`,
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
          setTxStatus('🍎 All ready fruits harvested!')
          fetchUserData()
          fetchLandData()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error harvesting:', error)
          setTxStatus('Error: ' + error.message)
        },
      }
    )
  }

  const totalSeeds = seedBags.reduce((acc, bag) => acc + bag.seeds, 0)
  const emptySlots = slots.filter(s => !s.fruit).length
  const readySlots = slots.filter(s => s.fruit && currentTime >= s.fruit.plantedAt + GROW_TIME_MS).length

  // Click on empty slot
  const handleSlotClick = (slot: Slot) => {
    if (!slot.fruit) {
      // Empty slot - open plant modal
      if (totalSeeds > 0 && selectedBag) {
        setPlantSlotIndex(slot.index)
        setSeedsToPlant(1)
        setShowPlantModal(true)
      }
    } else {
      // Has fruit - check if ready
      const isReady = currentTime >= slot.fruit.plantedAt + GROW_TIME_MS
      if (isReady && inventoryId) {
        harvestSlot(slot.index)
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

      {/* Seed Bags Overview */}
      <div className="seed-bags-section">
        <h4>🌱 Your Seeds: {totalSeeds}</h4>
        {seedBags.length > 0 && (
          <div className="seed-bags-list">
            {seedBags.map(bag => (
              <div 
                key={bag.id} 
                className={`seed-bag ${selectedBag === bag.id ? 'selected' : ''}`}
                onClick={() => setSelectedBag(bag.id)}
              >
                🎒 {bag.seeds}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No Land */}
      {!landId && (
        <div className="create-land-prompt">
          <h3>🏡 No Land Yet</h3>
          <p>Create your first land for FREE!</p>
          <button onClick={createLandOnChain} disabled={isPending}>
            {isPending ? 'Creating...' : '🌱 Create Land'}
          </button>
        </div>
      )}

      {/* Has Land */}
      {landId && (
        <>
          {/* No Inventory */}
          {!inventoryId && (
            <div className="create-inventory-prompt">
              <p>Create inventory to store harvested fruits</p>
              <button onClick={createInventoryOnChain} disabled={isPending}>
                {isPending ? 'Creating...' : '🎒 Create Inventory'}
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="land-actions">
            {emptySlots > 0 && totalSeeds > 0 && (
              <button onClick={() => setShowBatchModal(true)} disabled={isPending}>
                🌱 Plant All ({emptySlots} slots)
              </button>
            )}
            {readySlots > 0 && inventoryId && (
              <button onClick={harvestAll} disabled={isPending}>
                🌾 Harvest All ({readySlots} ready)
              </button>
            )}
          </div>

          {/* 6 Slots Grid */}
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
                      <span className="slot-emoji">{FRUITS[slot.fruit.fruitType - 1]?.emoji || '🍎'}</span>
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
          {inventoryId && inventory.length > 0 && (
            <div className="inventory-section">
              <h4>🎒 Your Inventory ({inventory.length} fruits)</h4>
              <div className="inventory-grid">
                {inventory.map((fruit, idx) => (
                  <div key={idx} className="inventory-fruit" style={{ borderColor: RARITY_COLORS[fruit.rarity - 1] }}>
                    <span className="fruit-emoji">{FRUITS[fruit.fruitType - 1]?.emoji || '🍎'}</span>
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
                max={seedBags.find(b => b.id === selectedBag)?.seeds || 1}
                value={seedsToPlant}
                onChange={(e) => setSeedsToPlant(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowPlantModal(false)}>Cancel</button>
              <button onClick={plantInSlot} disabled={isPending || totalSeeds < seedsToPlant}>
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
                max={Math.floor(totalSeeds / emptySlots)}
                value={batchSeeds}
                onChange={(e) => setBatchSeeds(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <p className="modal-total">Total: {batchSeeds * emptySlots} seeds</p>
            <div className="modal-actions">
              <button onClick={() => setShowBatchModal(false)}>Cancel</button>
              <button onClick={plantBatch} disabled={isPending || totalSeeds < batchSeeds * emptySlots}>
                🌱 Plant All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
