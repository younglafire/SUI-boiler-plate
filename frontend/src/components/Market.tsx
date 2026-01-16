import { useState, useEffect, useMemo } from 'react'
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

const PACKAGE_ID = '0x1664a15686e5eec8e9554734b7309399265a8771f10f98413bba2227a6537b30'
const CLOCK_OBJECT = '0x6'

// Copied from FruitGame.tsx
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

interface MarketProps {
  inventoryId: string | null
  onUpdate?: () => void
  refreshTrigger?: number
}

export default function Market({ inventoryId, onUpdate, refreshTrigger }: MarketProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()

  const [isLoading, setIsLoading] = useState(false)
  const [inventoryFruits, setInventoryFruits] = useState<InventoryFruit[]>([])
  const [selectedFruitType, setSelectedFruitType] = useState<number | null>(null)
  const [isMerchantModalOpen, setIsMerchantModalOpen] = useState(false)
  const [txStatus, setTxStatus] = useState('')

  // Load inventory items
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
           // fields.fruits is the vector
           const fields = obj.data.content.fields as any
           const fruits = fields.fruits || []
           // Each fruit in the vector has a nested 'fields' structure from SUI
           setInventoryFruits(fruits.map((f: any) => {
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
  }, [inventoryId, suiClient, txStatus, refreshTrigger]) // reload when tx completes

  // Group fruits by type
  const groupedFruits = useMemo(() => {
    const counts: Record<number, number> = {}
    inventoryFruits.forEach(f => {
      counts[f.fruit_type] = (counts[f.fruit_type] || 0) + 1
    })
    return counts
  }, [inventoryFruits])

  const openMerchant = () => {
    setIsMerchantModalOpen(true)
    setSelectedFruitType(null)
    setTxStatus('')
  }

  const handleMerge = async (fruitType: number, count: number) => {
    if (!inventoryId || !account) return
    setTxStatus('Merging...')
    
    try {
      const tx = new Transaction()
      tx.setGasBudget(100000000)

      tx.moveCall({
        target: `${PACKAGE_ID}::market::merge_fruits`,
        arguments: [
          tx.object(inventoryId),
          tx.pure.u8(fruitType),
          tx.pure.u64(count),
          tx.object(CLOCK_OBJECT),
        ],
      })

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            setTxStatus('Merge Successful! 🌱')
            if (onUpdate) onUpdate()
            // Auto refresh via effect dep on txStatus
            setTimeout(() => setTxStatus(''), 3000)
          },
          onError: (err) => {
            console.error(err)
            setTxStatus('Merge Failed')
          }
        }
      )
    } catch (e) {
      console.error(e)
      setTxStatus('Error creating transaction')
    }
  }

  return (
    <div className="market-container">
      <div className="market-header">
        <h2>🏪 Fruit Market</h2>
        <p>Trade with the merchant to upgrade your fruits</p>
      </div>

      <div className="merchant-area" onClick={openMerchant}>
        <div className="merchant-avatar">👳‍♂️</div>
        <div className="merchant-dialog">
          <p>"Greetings! I can merge your small fruits into bigger ones."</p>
          <span className="click-hint">(Click to Trade)</span>
        </div>
      </div>

      {isMerchantModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Merchant's Upgrade Service</h3>
              <button className="close-btn" onClick={() => setIsMerchantModalOpen(false)}>×</button>
            </div>
            
            <p className="modal-intro">
              Select a fruit type to merge. You need <strong>10</strong> fruits of the same type to create <strong>1</strong> next-level fruit with balanced mass.
            </p>

            {txStatus && <div className="tx-status">{txStatus}</div>}

            <div className="fruit-selection-grid">
              {FRUITS.map((fruit) => {
                const count = groupedFruits[fruit.level] || 0
                const canMerge = count >= 10
                
                // Allow selecting if we have at least 1, or always? 
                // User requirement: "người chơi chọn loại trái cây ... 10 trái sẽ merge ... ko đủ thì báo đỏ"
                // So show all types user has, or all possible types.
                
                return (
                  <div key={fruit.level} className={`fruit-merge-card ${selectedFruitType === fruit.level ? 'selected' : ''}`} onClick={() => setSelectedFruitType(fruit.level)}>
                    <div className="fruit-icon">{fruit.emoji}</div>
                    <div className="fruit-info">
                      <span className="fruit-name">{fruit.name} (Lvl {fruit.level})</span>
                      <span className={`fruit-count ${!canMerge ? 'warning' : 'success'}`}>
                        Owned: {count}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedFruitType && (
              <div className="action-area">
                {(() => {
                  const fruit = FRUITS.find(f => f.level === selectedFruitType)!
                  const count = groupedFruits[selectedFruitType] || 0
                  const maxMerges = Math.floor(count / 10)
                  
                  if (count < 10) {
                     return (
                         <div className="warning-box">
                             Not enough {fruit.name}s. You need 10 to merge (Have {count}).
                         </div>
                     )
                  }

                  return (
                      <div className="merge-actions">
                          <button className="base-btn" disabled={isPending} onClick={() => handleMerge(selectedFruitType, 1)}>
                              Merge 10 ➔ 1 {FRUITS.find(f => f.level === selectedFruitType + 1)?.name || 'Legendary'}
                          </button>
                          {maxMerges > 1 && (
                              <button className="max-btn" disabled={isPending} onClick={() => handleMerge(selectedFruitType, maxMerges)}>
                                  Merge All (x{maxMerges})
                              </button>
                          )}
                      </div>
                  )

                })()}
              </div>
            )}
          </div>
        </div>
      )}
      
      <style>{`
        .market-container {
            padding: 20px;
            color: white;
            max-width: 600px;
            margin: 0 auto;
        }
        .merchant-area {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 30px;
            display: flex;
            align-items: center;
            gap: 20px;
            cursor: pointer;
            transition: transform 0.2s;
            border: 2px solid rgba(255,255,255,0.1);
        }
        .merchant-area:hover {
            transform: scale(1.02);
            background: rgba(255, 255, 255, 0.15);
            border-color: #ffd700;
        }
        .merchant-avatar {
            font-size: 4rem;
        }
        .merchant-dialog p {
            font-size: 1.1rem;
            margin-bottom: 5px;
            font-style: italic;
        }
        .click-hint {
            font-size: 0.8rem;
            color: #ffd700;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        .modal-content {
            background: #1a1a2e;
            padding: 24px;
            border-radius: 16px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            border: 1px solid #333;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .close-btn {
            background: none;
            border: none;
            color: #666;
            font-size: 24px;
            cursor: pointer;
        }
        .fruit-selection-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
            margin: 20px 0;
            max-height: 300px;
            overflow-y: auto;
        }
        .fruit-merge-card {
            display: flex;
            align-items: center;
            padding: 10px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            cursor: pointer;
            border: 1px solid transparent;
        }
        .fruit-merge-card:hover {
            background: rgba(255,255,255,0.1);
        }
        .fruit-merge-card.selected {
            border-color: #ffd700;
            background: rgba(255,215,0, 0.1);
        }
        .fruit-icon {
            font-size: 1.5rem;
            margin-right: 12px;
            width: 30px;
            text-align: center;
        }
        .fruit-info {
            flex: 1;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .fruit-count {
            font-weight: bold;
        }
        .fruit-count.warning { color: #ff4444; }
        .fruit-count.success { color: #00fa9a; }
        
        .action-area {
            margin-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 20px;
            text-align: center;
        }
        .warning-box {
            color: #ff4444;
            padding: 10px;
            background: rgba(255,68,68,0.1);
            border-radius: 4px;
        }
        .merge-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        .base-btn, .max-btn {
            padding: 10px 20px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.2s;
        }
        .base-btn {
            background: #ffd700;
            color: #000;
        }
        .base-btn:hover { background: #ffed4a; }
        .max-btn {
            background: #4a90e2;
            color: white;
        }
        .max-btn:hover { background: #357abd; }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .tx-status {
            text-align: center;
            margin-bottom: 10px;
            color: #ffd700;
        }
      `}</style>
    </div>
  )
}
