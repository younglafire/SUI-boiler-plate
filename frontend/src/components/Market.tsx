import { useState, useEffect, useMemo } from 'react'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction } from '../hooks/useSponsoredTransaction'

const PACKAGE_ID = '0x599868f3b4e190173c1ec1d3bd2738239461d617f74fe136a1a2f021fdf02503'
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

// Tool prices in seeds (pay per use on-chain)
const TOOL_PRICES = {
  wateringCan: 50,
  fertilizer: 100,
  shovel: 25,
}

interface InventoryFruit {
  fruit_type: number
  rarity: number
  weight: number
}

interface MarketProps {
  inventoryId: string | null
  onUpdate?: () => void
  refreshTrigger?: number
  playerSeeds?: number
}

export default function Market({ inventoryId, onUpdate, refreshTrigger, playerSeeds = 0 }: MarketProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSponsoredTransaction()

  const [inventoryFruits, setInventoryFruits] = useState<InventoryFruit[]>([])
  const [selectedFruitType, setSelectedFruitType] = useState<number | null>(null)
  const [isMerchantModalOpen, setIsMerchantModalOpen] = useState(false)
  const [merchantTab, setMerchantTab] = useState<'merging' | 'buying'>('merging')
  const [txStatus, setTxStatus] = useState('')

  // Load inventory items
  useEffect(() => {
    async function fetchInventory() {
      if (!inventoryId) return
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
    setMerchantTab('merging')
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
          onSuccess: () => {
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
        <p>Trade with the merchant to upgrade your fruits or buy tools</p>
      </div>

      <div className="merchant-area" onClick={openMerchant}>
        <div className="merchant-avatar">👳‍♂️</div>
        <div className="merchant-dialog">
          <p>"Greetings! I can merge your fruits or sell you useful tools."</p>
          <span className="click-hint">(Click to Trade)</span>
        </div>
      </div>

      {isMerchantModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Merchant's Shop</h3>
              <button className="close-btn" onClick={() => setIsMerchantModalOpen(false)}>×</button>
            </div>

            {/* Tab Navigation */}
            <div className="merchant-tabs">
              <button 
                className={`tab-btn ${merchantTab === 'merging' ? 'active' : ''}`}
                onClick={() => setMerchantTab('merging')}
              >
                🔄 Merging
              </button>
              <button 
                className={`tab-btn ${merchantTab === 'buying' ? 'active' : ''}`}
                onClick={() => setMerchantTab('buying')}
              >
                🛒 Buying
              </button>
            </div>

            {txStatus && <div className="tx-status">{txStatus}</div>}

            {merchantTab === 'merging' ? (
              <>
                <p className="modal-intro">
                  Select a fruit type to merge. You need <strong>10</strong> fruits of the same type to create <strong>1</strong> next-level fruit with balanced mass.
                </p>

                <div className="fruit-selection-grid">
                  {FRUITS.map((fruit) => {
                    const count = groupedFruits[fruit.level] || 0
                    const canMerge = count >= 10
                    
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
              </>
            ) : (
              /* BUYING TAB - Tools Information */
              <div className="shop-section">
                <p className="modal-intro">
                  Use tools directly from your <strong>Farm</strong>! Select a planted fruit and choose a tool to use.
                  Tools are pay-per-use with SEED tokens.
                </p>
                <p className="seeds-info">💰 Your Seeds: <strong>{playerSeeds}</strong></p>

                <div className="shop-items-grid">
                  {/* Watering Can */}
                  <div className="shop-item-card info-only">
                    <div className="shop-item-icon">🚿</div>
                    <div className="shop-item-info">
                      <h4>Chậu Tưới Cây</h4>
                      <p className="shop-item-desc">Speeds up ripening by <strong>25%</strong></p>
                    </div>
                    <div className="shop-item-action">
                      <span className="shop-price">🌱 {TOOL_PRICES.wateringCan} per use</span>
                    </div>
                  </div>

                  {/* Fertilizer */}
                  <div className="shop-item-card info-only">
                    <div className="shop-item-icon">🧪</div>
                    <div className="shop-item-info">
                      <h4>Fertilizer</h4>
                      <p className="shop-item-desc">Speeds up ripening by <strong>50%</strong></p>
                    </div>
                    <div className="shop-item-action">
                      <span className="shop-price">🌱 {TOOL_PRICES.fertilizer} per use</span>
                    </div>
                  </div>

                  {/* Shovel */}
                  <div className="shop-item-card info-only">
                    <div className="shop-item-icon">🪓</div>
                    <div className="shop-item-info">
                      <h4>Shovel</h4>
                      <p className="shop-item-desc">Remove unwanted planted fruit (burns it)</p>
                    </div>
                    <div className="shop-item-action">
                      <span className="shop-price">🌱 {TOOL_PRICES.shovel} per use</span>
                    </div>
                  </div>
                </div>

                <div className="shop-info-note">
                  <p>💡 Go to your <strong>Farm</strong> to use these tools on planted fruits!</p>
                </div>
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
        /* Merchant Tabs */
        .merchant-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 15px;
        }
        .tab-btn {
            flex: 1;
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.05);
            color: #888;
            cursor: pointer;
            font-weight: bold;
            font-size: 1rem;
            transition: all 0.2s;
        }
        .tab-btn:hover {
            background: rgba(255,255,255,0.1);
            color: #fff;
        }
        .tab-btn.active {
            background: linear-gradient(135deg, #ffd700, #f39c12);
            color: #000;
            border-color: #ffd700;
        }
        /* Shop Section */
        .shop-section {
            padding: 10px 0;
        }
        .seeds-info {
            text-align: center;
            margin-bottom: 20px;
            font-size: 1.1rem;
            color: #fff;
        }
        .shop-items-grid {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .shop-item-card {
            display: flex;
            align-items: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.2s;
        }
        .shop-item-card:hover {
            background: rgba(255,255,255,0.08);
            border-color: rgba(255,215,0, 0.3);
        }
        .shop-item-icon {
            font-size: 2.5rem;
            margin-right: 15px;
            width: 50px;
            text-align: center;
        }
        .shop-item-info {
            flex: 1;
        }
        .shop-item-info h4 {
            margin: 0 0 5px 0;
            font-size: 1.1rem;
            color: #fff;
        }
        .shop-item-desc {
            margin: 0 0 5px 0;
            font-size: 0.85rem;
            color: #aaa;
        }
        .shop-item-owned {
            margin: 0;
            font-size: 0.8rem;
            color: #00fa9a;
        }
        .shop-item-action {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .shop-price {
            font-size: 0.9rem;
            color: #ffd700;
            font-weight: bold;
        }
        .buy-btn {
            padding: 8px 20px;
            border-radius: 8px;
            border: none;
            background: linear-gradient(135deg, #00fa9a, #00c87a);
            color: #000;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
        }
        .buy-btn:hover {
            filter: brightness(1.1);
            transform: scale(1.05);
        }
        .buy-btn:disabled {
            background: #555;
            color: #888;
            cursor: not-allowed;
            transform: none;
        }
        .shop-item-card.info-only {
            cursor: default;
        }
        .shop-item-card.info-only:hover {
            background: rgba(255,255,255,0.05);
            border-color: rgba(255,255,255,0.1);
        }
        .shop-info-note {
            margin-top: 20px;
            padding: 15px;
            background: rgba(255,215,0, 0.1);
            border-radius: 10px;
            border: 1px solid rgba(255,215,0, 0.3);
            text-align: center;
        }
        .shop-info-note p {
            margin: 0;
            color: #ffd700;
        }
      `}</style>
    </div>
  )
}
