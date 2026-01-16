import { useState, useEffect, useMemo } from 'react'
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = '0x1664a15686e5eec8e9554734b7309399265a8771f10f98413bba2227a6537b30'
const SEED_ADMIN_CAP = '0x63a07081520fe716d6a411c773d40313e79aaff63e07e3bff3cf129151b3246d'
const SEED_COIN_TYPE = `${PACKAGE_ID}::seed::SEED`
const SEED_DECIMALS = 1_000_000_000n
const INVENTORY_UPGRADE_BASE_COST = 200n // Base cost, increases with level
const INVENTORY_SLOTS_PER_UPGRADE = 10
const MAX_INVENTORY_SLOTS = 200

// Calculate upgrade cost based on current slots
const calculateUpgradeCost = (currentSlots: number): bigint => {
  const upgrades = Math.floor((currentSlots - 20) / INVENTORY_SLOTS_PER_UPGRADE)
  return INVENTORY_UPGRADE_BASE_COST * BigInt(upgrades + 1)
}

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

interface InventoryFruit {
  fruit_type: number
  rarity: number
  weight: number
}

interface InventoryProps {
  inventoryId: string | null
  playerId?: string | null
  refreshTrigger?: number
  onUpdate?: () => void
}

export default function Inventory({ inventoryId, playerId, refreshTrigger, onUpdate }: InventoryProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  const [fruits, setFruits] = useState<InventoryFruit[]>([])
  const [maxSlots, setMaxSlots] = useState(20)
  const [isLoading, setIsLoading] = useState(false)
  const [txStatus, setTxStatus] = useState('')
  const [selectedType, setSelectedType] = useState<number | null>(null)

  useEffect(() => {
    async function fetchInventory() {
      if (!inventoryId) return
      setIsLoading(true)
      try {
        const obj = await suiClient.getObject({
          id: inventoryId,
          options: { showContent: true }
        })

        if (obj.data?.content?.dataType === 'moveObject') {
           const fields = obj.data.content.fields as any
           const inventoryFruits = fields.fruits || []
           const slots = Number(fields.max_slots || 20)
           setMaxSlots(slots)
           
           // Each fruit in the vector has a nested 'fields' structure from SUI
           setFruits(inventoryFruits.map((f: any) => {
             // Handle both direct fields and nested fields structure
             const fruitData = f.fields || f
             return {
               fruit_type: Number(fruitData.fruit_type || 0),
               rarity: Number(fruitData.rarity || 1),
               weight: Number(fruitData.weight || 100)
             }
           }))
        }
      } catch (err) {
        console.error("Failed to load inventory", err)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchInventory()
  }, [inventoryId, suiClient, refreshTrigger])

  // Group fruits by type
  const groupedByType = useMemo(() => {
    const groups: Record<number, InventoryFruit[]> = {}
    fruits.forEach(f => {
      if (!groups[f.fruit_type]) groups[f.fruit_type] = []
      groups[f.fruit_type].push(f)
    })
    // Sort by fruit type (level)
    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([type, items]) => ({ type: Number(type), items }))
  }, [fruits])

  // Filtered fruits based on selection
  const displayedFruits = useMemo(() => {
    if (selectedType === null) return fruits
    return fruits.filter(f => f.fruit_type === selectedType)
  }, [fruits, selectedType])

  // Get rarity name
  const getRarityName = (rarity: number) => {
    switch (rarity) {
      case 1: return 'Common'
      case 2: return 'Uncommon'
      case 3: return 'Rare'
      case 4: return 'Epic'
      case 5: return 'Legendary'
      default: return 'Common'
    }
  }

  // Get rarity color
  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 1: return '#a0a0a0' // Grey
      case 2: return '#00fa9a' // Green
      case 3: return '#00bfff' // Blue
      case 4: return '#9932cc' // Purple
      case 5: return '#ffd700' // Gold
      default: return '#a0a0a0'
    }
  }

  // Upgrade inventory
  const upgradeInventory = async () => {
    if (!account?.address || !inventoryId) {
      setTxStatus('❌ Missing account or inventory')
      return
    }
    
    // Find player account
    const objects = await suiClient.getOwnedObjects({
      owner: account.address,
      options: { showType: true }
    })
    
    const playerObj = objects.data.find(o => 
      o.data?.type?.includes(`${PACKAGE_ID}::player::PlayerAccount`)
    )
    
    if (!playerObj?.data?.objectId) {
      setTxStatus('❌ Player account not found')
      return
    }

    setTxStatus('⬆️ Upgrading inventory...')
    
    // Get SEED coins
    const seedCoins = await suiClient.getCoins({
      owner: account.address,
      coinType: SEED_COIN_TYPE,
    })
    
    if (seedCoins.data.length === 0) {
      setTxStatus('❌ No SEED coins found')
      return
    }
    
    const tx = new Transaction()
    
    // Merge coins if needed
    if (seedCoins.data.length > 1) {
      const coinIds = seedCoins.data.map(coin => tx.object(coin.coinObjectId))
      tx.mergeCoins(coinIds[0], coinIds.slice(1))
    }
    
    // Split payment (cost increases with each upgrade)
    const upgradeCost = calculateUpgradeCost(maxSlots)
    const amountWithDecimals = upgradeCost * SEED_DECIMALS
    const [payment] = tx.splitCoins(
      tx.object(seedCoins.data[0].coinObjectId),
      [tx.pure.u64(amountWithDecimals)]
    )
    
    tx.moveCall({
      target: `${PACKAGE_ID}::player::upgrade_inventory`,
      arguments: [
        tx.object(playerObj.data.objectId),
        tx.object(inventoryId),
        payment,
        tx.object(SEED_ADMIN_CAP),
      ],
    })
    
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          setTxStatus(`✅ Inventory upgraded! +${INVENTORY_SLOTS_PER_UPGRADE} slots`)
          onUpdate?.()
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error upgrading:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  const isFull = fruits.length >= maxSlots
  const isNearFull = fruits.length >= maxSlots - 2
  const nextUpgradeCost = calculateUpgradeCost(maxSlots)
  const canUpgrade = maxSlots < MAX_INVENTORY_SLOTS

  return (
    <div className="inventory-container">
      <div className="inventory-header">
        <h2>🎒 Harvested Fruits</h2>
        <div className="inventory-capacity">
          <span className={`capacity-text ${isFull ? 'full' : isNearFull ? 'warning' : ''}`}>
            {fruits.length} / {maxSlots} slots
          </span>
          {canUpgrade && (
            <button 
              className="upgrade-btn" 
              onClick={upgradeInventory}
              disabled={isPending}
            >
              ⬆️ Upgrade (+{INVENTORY_SLOTS_PER_UPGRADE} slots, {nextUpgradeCost.toString()} SEED)
            </button>
          )}
          {!canUpgrade && (
            <span className="max-reached">MAX LEVEL</span>
          )}
        </div>
      </div>

      {/* Warning banner when near full */}
      {(isFull || isNearFull) && (
        <div className={`capacity-warning ${isFull ? 'full' : 'warning'}`}>
          {isFull 
            ? '⚠️ Inventory is FULL! Upgrade to harvest more fruits.' 
            : '⚠️ Inventory almost full! Consider upgrading.'}
        </div>
      )}

      {/* Fruit type filter tabs */}
      {groupedByType.length > 0 && (
        <div className="type-filter">
          <button 
            className={`filter-btn ${selectedType === null ? 'active' : ''}`}
            onClick={() => setSelectedType(null)}
          >
            All ({fruits.length})
          </button>
          {groupedByType.map(({ type, items }) => {
            const fruitInfo = FRUITS.find(f => f.level === type)
            return (
              <button 
                key={type}
                className={`filter-btn ${selectedType === type ? 'active' : ''}`}
                onClick={() => setSelectedType(type)}
              >
                {fruitInfo?.emoji} {items.length}
              </button>
            )
          })}
        </div>
      )}

      {/* Transaction status */}
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Loading inventory...</div>
      ) : fruits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🌾</div>
          <h3>Inventory is empty</h3>
          <p>Harvest fruits from your land to see them here!</p>
        </div>
      ) : (
        <div className="inventory-grid">
          {displayedFruits.map((fruit, idx) => {
            const fruitInfo = FRUITS.find(f => f.level === fruit.fruit_type)
            return (
              <div key={idx} className="inventory-item" style={{ borderColor: getRarityColor(fruit.rarity) }}>
                <div className="item-icon">{fruitInfo?.emoji || '❓'}</div>
                <div className="item-details">
                  <div className="item-name">{fruitInfo?.name || 'Unknown'}</div>
                  <div className="item-rarity" style={{ color: getRarityColor(fruit.rarity) }}>
                    {getRarityName(fruit.rarity)}
                  </div>
                  <div className="item-weight">{fruit.weight}g</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      
      <style>{`
        .inventory-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 15px 20px;
        }
        .inventory-capacity {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .capacity-text {
          font-size: 1rem;
          padding: 5px 12px;
          background: rgba(255,255,255,0.1);
          border-radius: 20px;
        }
        .capacity-text.warning {
          background: rgba(255, 165, 0, 0.3);
          color: #ffa500;
        }
        .capacity-text.full {
          background: rgba(255, 0, 0, 0.3);
          color: #ff4444;
        }
        .upgrade-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-weight: bold;
          transition: transform 0.2s, opacity 0.2s;
        }
        .upgrade-btn:hover:not(:disabled) {
          transform: scale(1.05);
        }
        .upgrade-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .capacity-warning {
          padding: 12px 20px;
          margin: 0 20px 15px;
          border-radius: 8px;
          text-align: center;
          font-weight: bold;
        }
        .capacity-warning.warning {
          background: rgba(255, 165, 0, 0.2);
          border: 1px solid rgba(255, 165, 0, 0.5);
          color: #ffa500;
        }
        .capacity-warning.full {
          background: rgba(255, 0, 0, 0.2);
          border: 1px solid rgba(255, 0, 0, 0.5);
          color: #ff4444;
        }
        .type-filter {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 0 20px 15px;
        }
        .filter-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          padding: 6px 12px;
          border-radius: 20px;
          color: white;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .filter-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .filter-btn.active {
          background: rgba(102, 126, 234, 0.5);
          border-color: #667eea;
        }
        .tx-status {
          padding: 10px 20px;
          margin: 0 20px 15px;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          text-align: center;
        }
        .inventory-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 15px;
          padding: 20px;
        }
        .inventory-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 15px;
          text-align: center;
          border: 2px solid rgba(255,255,255,0.1);
          transition: transform 0.2s;
        }
        .inventory-item:hover {
          transform: translateY(-5px);
          background: rgba(255, 255, 255, 0.1);
        }
        .item-icon {
          font-size: 2.5rem;
          margin-bottom: 10px;
        }
        .item-name {
          font-weight: bold;
          margin-bottom: 5px;
        }
        .item-rarity {
          font-size: 0.8rem;
          text-transform: uppercase;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .item-weight {
          font-size: 0.9rem;
          color: #aaa;
        }
      `}</style>
    </div>
  )
}
