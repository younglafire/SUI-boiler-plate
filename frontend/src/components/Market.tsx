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
  initialMergeFruitType?: number | null
  mergeTrigger?: number
}

export default function Market({ inventoryId, onUpdate, refreshTrigger, playerSeeds = 0, initialMergeFruitType = null, mergeTrigger = 0 }: MarketProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSponsoredTransaction()

  const [inventoryFruits, setInventoryFruits] = useState<InventoryFruit[]>([])
  const [isMerchantModalOpen, setIsMerchantModalOpen] = useState(false)
  const [merchantTab, setMerchantTab] = useState<'merging' | 'buying'>('merging')
  const [txStatus, setTxStatus] = useState('')
  
  // States for fruit merge modal
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeFruitType, setMergeFruitType] = useState<number | null>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [mergedFruitResult, setMergedFruitResult] = useState<{ type: number; count: number } | null>(null)

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

  // Open merge modal when requested externally (from Inventory)
  useEffect(() => {
    if (initialMergeFruitType) {
      setMergeFruitType(initialMergeFruitType)
      setShowMergeModal(true)
      setMerchantTab('merging')
    }
  }, [initialMergeFruitType, mergeTrigger])

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
    setTxStatus('')
  }

  // Handle clicking on a fruit card - open merge modal
  const handleFruitClick = (fruitLevel: number) => {
    setMergeFruitType(fruitLevel)
    setShowMergeModal(true)
  }

  const closeMergeModal = () => {
    setShowMergeModal(false)
    setMergeFruitType(null)
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
          onSuccess: async (result) => {
            await suiClient.waitForTransaction({ digest: result.digest })
            setTxStatus('Merge Successful! 🌱')
            // Show success modal with big fruit
            setMergedFruitResult({ type: fruitType, count: count })
            setShowMergeModal(false)
            setShowSuccessModal(true)
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
          <p>"Greetings! I can merge your fruits to create <strong>Legendary</strong> ones!"</p>
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
                🔄 Weight Merging
              </button>
              <button 
                className={`tab-btn ${merchantTab === 'buying' ? 'active' : ''}`}
                onClick={() => setMerchantTab('buying')}
              >
                🛒 Tool Shop
              </button>
            </div>

            {txStatus && <div className="tx-status">{txStatus}</div>}

            {merchantTab === 'merging' ? (
              <>
                <div className="merge-explanation">
                  <h4>🌟 The Secret of Density</h4>
                  <p>
                    Combine <strong>10</strong> fruits of the same type to create <strong>1 condensed fruit</strong> of the SAME type.
                  </p>
                  <div className="merge-formula">
                    <span className="formula-part">10 x 🍒 (10g)</span>
                    <span className="formula-arrow">➔</span>
                    <span className="formula-part highlight">1 x 🍒 (50g)</span>
                  </div>
                  <p className="merge-note">
                    <strong>Why merge?</strong> Merging preserves 50% of total weight. This creates super-heavy fruits!
                    <br/>
                    <span className="legendary-hint">✨ This is the ONLY way to get <strong>LEGENDARY</strong> rarity! Planting caps at Epic.</span>
                  </p>
                </div>

                <div className="fruit-selection-grid">
                  {FRUITS.map((fruit) => {
                    const count = groupedFruits[fruit.level] || 0
                    const canMerge = count >= 10
                    
                    return (
                      <div key={fruit.level} className={`fruit-merge-card ${canMerge ? 'can-merge' : ''}`} onClick={() => handleFruitClick(fruit.level)}>
                        <div className="fruit-icon">{fruit.emoji}</div>
                        <div className="fruit-info">
                          <span className="fruit-name">{fruit.name} (Lvl {fruit.level})</span>
                          <span className={`fruit-count ${!canMerge ? 'warning' : 'success'}`}>
                            Owned: {count}
                          </span>
                        </div>
                        {canMerge && <span className="merge-badge">✨ Ready!</span>}
                      </div>
                    )
                  })}
                </div>
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
                      <h4>Watering Can</h4>
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

      {/* Fruit Merge Modal - Shows when clicking a fruit */}
      {showMergeModal && mergeFruitType && (() => {
        const fruit = FRUITS.find(f => f.level === mergeFruitType)!
        const count = groupedFruits[mergeFruitType] || 0
        const canMerge = count >= 10
        const maxMerges = Math.floor(count / 10)

        return (
          <div className="modal-overlay" onClick={closeMergeModal}>
            <div className="merge-fruit-modal" onClick={e => e.stopPropagation()}>
              <button className="close-btn" onClick={closeMergeModal}>×</button>
              
              <div className="merge-fruit-header">
                <div className="big-fruit-icon">{fruit.emoji}</div>
                <h3>{fruit.name}</h3>
                <p className="fruit-level">Level {fruit.level}</p>
              </div>

              <div className="merge-fruit-stats">
                <div className="stat-row">
                  <span>Owned:</span>
                  <span className={canMerge ? 'success' : 'warning'}>{count}</span>
                </div>
                <div className="stat-row">
                  <span>Required to merge:</span>
                  <span>10</span>
                </div>
              </div>

              {!canMerge ? (
                <div className="merge-not-enough">
                  <div className="not-enough-icon">🚫</div>
                  <p>Not enough {fruit.name}s to merge!</p>
                  <p className="need-more">You need <strong>{10 - count} more</strong> to merge</p>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(count / 10) * 100}%` }}></div>
                  </div>
                  <p className="progress-text">{count} / 10</p>
                </div>
              ) : (
                <div className="merge-ready">
                  <div className="ready-icon">✨</div>
                  <p>Ready to merge!</p>
                  <p className="merge-info">10 fruits → 1 Heavy {fruit.name} (50% weight preserved)</p>
                  
                  {txStatus && <div className="tx-status-inline">{txStatus}</div>}
                  
                  <div className="merge-buttons">
                    <button 
                      className="merge-btn primary" 
                      disabled={isPending}
                      onClick={() => handleMerge(mergeFruitType, 1)}
                    >
                      🔄 Merge 10 → 1
                    </button>
                    {maxMerges > 1 && (
                      <button 
                        className="merge-btn secondary" 
                        disabled={isPending}
                        onClick={() => handleMerge(mergeFruitType, maxMerges)}
                      >
                        ⚡ Merge All (x{maxMerges})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Success Modal - Shows the merged fruit result */}
      {showSuccessModal && mergedFruitResult && (() => {
        const fruit = FRUITS.find(f => f.level === mergedFruitResult.type)!
        return (
          <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
            <div className="success-modal" onClick={e => e.stopPropagation()}>
              <div className="success-confetti">🎉</div>
              <div className="success-fruit-display">
                <div className="giant-fruit">{fruit.emoji}</div>
                <div className="success-glow"></div>
              </div>
              <h2>Merge Successful!</h2>
              <p className="success-text">
                You created <strong>{mergedFruitResult.count}</strong> Heavy {fruit.name}{mergedFruitResult.count > 1 ? 's' : ''}!
              </p>
              <p className="legendary-tip">✨ Keep merging to reach LEGENDARY rarity!</p>
              <button className="success-close-btn" onClick={() => setShowSuccessModal(false)}>
                Awesome! 🎊
              </button>
            </div>
          </div>
        )
      })()}
      
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
        .merge-explanation {
            background: rgba(52, 152, 219, 0.1);
            border: 1px solid #3498db;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .merge-explanation h4 {
            color: #3498db;
            margin: 0 0 10px 0;
        }
        .merge-explanation p {
            font-size: 0.9rem;
            color: #ddd;
            margin-bottom: 10px;
        }
        .merge-formula {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background: rgba(0,0,0,0.3);
            padding: 10px;
            border-radius: 6px;
            margin: 10px 0;
        }
        .formula-part {
            font-weight: bold;
        }
        .formula-part.highlight {
            color: #ffd700;
            text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
        }
        .merge-note {
            font-size: 0.85rem !important;
            margin-top: 10px;
        }
        .legendary-hint {
            color: #ffd700;
            display: block;
            margin-top: 5px;
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
        
        /* Merge Badge on fruit cards */
        .merge-badge {
            background: linear-gradient(135deg, #ffd700, #f39c12);
            color: #000;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: bold;
            animation: pulse-badge 1.5s infinite;
        }
        @keyframes pulse-badge {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        .fruit-merge-card.can-merge {
            border: 2px solid #ffd700;
            background: rgba(255,215,0, 0.1);
        }
        .fruit-merge-card.can-merge:hover {
            background: rgba(255,215,0, 0.2);
            transform: translateX(5px);
        }
        
        /* Merge Fruit Modal */
        .merge-fruit-modal {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            padding: 30px;
            border-radius: 24px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            border: 2px solid rgba(255,255,255,0.1);
            position: relative;
            animation: modal-pop 0.3s ease-out;
        }
        @keyframes modal-pop {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        .merge-fruit-header {
            margin-bottom: 25px;
        }
        .big-fruit-icon {
            font-size: 5rem;
            margin-bottom: 10px;
            filter: drop-shadow(0 5px 15px rgba(0,0,0,0.3));
        }
        .merge-fruit-header h3 {
            margin: 0;
            font-size: 1.8rem;
            color: #fff;
        }
        .fruit-level {
            color: #888;
            margin: 5px 0 0 0;
        }
        .merge-fruit-stats {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .stat-row:last-child { border-bottom: none; }
        .stat-row .success { color: #00fa9a; font-weight: bold; }
        .stat-row .warning { color: #ff4444; font-weight: bold; }
        
        /* Not Enough State */
        .merge-not-enough {
            padding: 20px;
        }
        .not-enough-icon {
            font-size: 3rem;
            margin-bottom: 10px;
        }
        .merge-not-enough p {
            margin: 5px 0;
            color: #ff6b6b;
        }
        .need-more {
            color: #ffd700 !important;
            font-size: 1.1rem;
        }
        .progress-bar {
            background: rgba(255,255,255,0.1);
            height: 12px;
            border-radius: 6px;
            overflow: hidden;
            margin: 15px 0 5px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ff4444, #ff6b6b);
            border-radius: 6px;
            transition: width 0.3s ease;
        }
        .progress-text {
            font-size: 0.9rem;
            color: #888;
        }
        
        /* Ready to Merge State */
        .merge-ready {
            padding: 20px;
        }
        .ready-icon {
            font-size: 3rem;
            margin-bottom: 10px;
            animation: sparkle 1s infinite;
        }
        @keyframes sparkle {
            0%, 100% { transform: rotate(0deg) scale(1); }
            25% { transform: rotate(-10deg) scale(1.1); }
            75% { transform: rotate(10deg) scale(1.1); }
        }
        .merge-ready p {
            margin: 5px 0;
            color: #00fa9a;
        }
        .merge-info {
            color: #888 !important;
            font-size: 0.9rem;
        }
        .tx-status-inline {
            color: #ffd700;
            margin: 15px 0;
            font-weight: bold;
        }
        .merge-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 20px;
        }
        .merge-btn {
            padding: 16px 24px;
            min-height: 52px;
            border-radius: 14px;
            border: none;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
        }
        .merge-btn.primary {
            background: linear-gradient(135deg, #ffd700, #f39c12);
            color: #000;
        }
        .merge-btn.primary:hover {
            filter: brightness(1.1);
            transform: translateY(-2px);
        }
        .merge-btn.secondary {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: #fff;
        }
        .merge-btn.secondary:hover {
            filter: brightness(1.1);
            transform: translateY(-2px);
        }
        .merge-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        /* Success Modal */
        .success-modal {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            padding: 40px;
            border-radius: 24px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            border: 2px solid #ffd700;
            position: relative;
            animation: success-pop 0.5s ease-out;
            overflow: hidden;
        }
        @keyframes success-pop {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
        }
        .success-confetti {
            font-size: 2rem;
            position: absolute;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            animation: confetti-bounce 0.5s ease-out;
        }
        @keyframes confetti-bounce {
            0% { transform: translateX(-50%) translateY(-50px); opacity: 0; }
            100% { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        .success-fruit-display {
            position: relative;
            margin: 20px 0;
        }
        .giant-fruit {
            font-size: 8rem;
            animation: fruit-bounce 1s ease-out;
            filter: drop-shadow(0 10px 30px rgba(255,215,0,0.5));
        }
        @keyframes fruit-bounce {
            0% { transform: scale(0) rotate(-180deg); }
            60% { transform: scale(1.2) rotate(10deg); }
            80% { transform: scale(0.9) rotate(-5deg); }
            100% { transform: scale(1) rotate(0deg); }
        }
        .success-glow {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 200px;
            height: 200px;
            background: radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%);
            animation: glow-pulse 2s infinite;
            z-index: -1;
        }
        @keyframes glow-pulse {
            0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
            50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
        }
        .success-modal h2 {
            color: #ffd700;
            margin: 10px 0;
            font-size: 1.8rem;
        }
        .success-text {
            color: #fff;
            font-size: 1.1rem;
            margin: 10px 0;
        }
        .legendary-tip {
            color: #ffd700;
            font-size: 0.9rem;
            margin: 15px 0;
        }
        .success-close-btn {
            padding: 16px 40px;
            min-height: 52px;
            background: linear-gradient(135deg, #00fa9a, #00c87a);
            color: #000;
            border: none;
            border-radius: 14px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            margin-top: 15px;
            transition: all 0.2s;
        }
        .success-close-btn:hover {
            filter: brightness(1.1);
            transform: scale(1.05);
        }
      `}</style>
    </div>
  )
}