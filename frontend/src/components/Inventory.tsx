import { useState, useEffect } from 'react'
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'

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
  refreshTrigger?: number
}

export default function Inventory({ inventoryId, refreshTrigger }: InventoryProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const [fruits, setFruits] = useState<InventoryFruit[]>([])
  const [isLoading, setIsLoading] = useState(false)

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
           
           setFruits(inventoryFruits.map((f: any) => ({
             fruit_type: Number(f.fruit_type),
             rarity: Number(f.rarity),
             weight: Number(f.weight)
           })))
        }
      } catch (err) {
        console.error("Failed to load inventory", err)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchInventory()
  }, [inventoryId, suiClient, refreshTrigger])

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

  return (
    <div className="inventory-container">
      <div className="inventory-header">
        <h2>🎒 Harvested Fruits</h2>
        <p className="inventory-subtitle">
          Fruits collected from your farm are stored here
        </p>
      </div>

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
          {fruits.map((fruit, idx) => {
            const fruitInfo = FRUITS.find(f => f.level === fruit.fruit_type)
            return (
              <div key={idx} className="inventory-item" style={{ borderColor: getRarityColor(fruit.rarity) }}>
                <div className="item-icon">{fruitInfo?.emoji || '❓'}</div>
                <div className="item-details">
                  <div className="item-name">{fruitInfo?.name}</div>
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
          border: 1px solid rgba(255,255,255,0.1);
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
