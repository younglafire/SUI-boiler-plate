import { useState, useEffect, useMemo } from 'react'
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction } from '../hooks/useSponsoredTransaction'

const PACKAGE_ID = '0x599868f3b4e190173c1ec1d3bd2738239461d617f74fe136a1a2f021fdf02503'
const CLOCK_OBJECT = '0x6'

// Fruit Assets
import imgCherry from '../assets/fruit/Cherry.png'
import imgGrape from '../assets/fruit/Nho.png'
import imgOrange from '../assets/fruit/Cam.png'
import imgLemon from '../assets/fruit/Chanh.png'
import imgApple from '../assets/fruit/Táo.png'
import imgPear from '../assets/fruit/Lê.png'
import imgPeach from '../assets/fruit/Đào.png'
import imgPineapple from '../assets/fruit/Thơm.png'
import imgMelon from '../assets/fruit/Dưa lưới.png'
import imgWatermelon from '../assets/fruit/Dưa hấu.png'

// Import Merge Man
import mergeMan from '../assets/MERGE-MAN.png'

// Updated FRUITS with images
const FRUITS = [
  { level: 1, image: imgCherry, name: 'Cherry' },
  { level: 2, image: imgGrape, name: 'Grape' },
  { level: 3, image: imgOrange, name: 'Orange' },
  { level: 4, image: imgLemon, name: 'Lemon' },
  { level: 5, image: imgApple, name: 'Apple' },
  { level: 6, image: imgPear, name: 'Pear' },
  { level: 7, image: imgPeach, name: 'Peach' },
  { level: 8, image: imgPineapple, name: 'Pineapple' },
  { level: 9, image: imgMelon, name: 'Melon' },
  { level: 10, image: imgWatermelon, name: 'Watermelon' },
]

interface InventoryFruit {
  fruit_type: number
  rarity: number
  weight: number
  originalIndex: number
}

interface MarketProps {
  inventoryId: string | null
  onUpdate?: () => void
  refreshTrigger?: number
  playerSeeds?: number
  initialMergeFruitType?: number | null
  mergeTrigger?: number
}

const FRUIT_WEIGHT_RANGES: Record<number, [number, number]> = {
  1: [5, 15], 2: [2, 5], 3: [130, 200], 4: [60, 100], 5: [150, 250],
  6: [180, 280], 7: [120, 180], 8: [900, 1500], 9: [1000, 2000], 10: [3000, 6000],
}

const calculateRarityFromWeight = (type: number, weight: number): number => {
  const range = FRUIT_WEIGHT_RANGES[type] || [0, 100]
  const max = range[1]; const baseRange = range[1] - range[0]
  if (weight <= max) return 1
  const excess = weight - max; const excessPercent = (excess * 100) / baseRange
  if (excessPercent >= 200) return 5; if (excessPercent >= 100) return 4
  if (excessPercent >= 50) return 3; if (excessPercent >= 20) return 2
  return 1
}

export default function Market({ inventoryId, onUpdate, refreshTrigger, playerSeeds = 0, initialMergeFruitType = null, mergeTrigger = 0 }: MarketProps) {
  const account = useCurrentAccount(); const suiClient = useSuiClient(); const { mutate: signAndExecute, isPending } = useSponsoredTransaction()
  const [inventoryFruits, setInventoryFruits] = useState<InventoryFruit[]>([]); const [txStatus, setTxStatus] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false); const [showResultModal, setShowResultModal] = useState(false)
  const [targetFruitType, setTargetFruitType] = useState<number | null>(null); const [fruitsToBurn, setFruitsToBurn] = useState<InventoryFruit[]>([])
  const [resultFruit, setResultFruit] = useState<InventoryFruit | null>(null)

  useEffect(() => {
    async function fetchInventory() {
      if (!inventoryId) return
      try {
        const obj = await suiClient.getObject({ id: inventoryId, options: { showContent: true } })
        if (obj.data?.content?.dataType === 'moveObject') {
           const fields = obj.data.content.fields as any
           setInventoryFruits((fields.fruits || []).map((f: any, idx: number) => {
             const d = f.fields || f; return { fruit_type: Number(d.fruit_type || 0), rarity: Number(d.rarity || 1), weight: Number(d.weight || 100), originalIndex: idx }
           }))
        }
      } catch (err) { console.error(err) }
    }
    fetchInventory()
  }, [inventoryId, suiClient, txStatus, refreshTrigger])

  const groupedFruits = useMemo(() => {
    const c: Record<number, number> = {}; inventoryFruits.forEach(f => c[f.fruit_type] = (c[f.fruit_type] || 0) + 1); return c
  }, [inventoryFruits])

  const mergeableFruits = FRUITS.filter(f => (groupedFruits[f.level] || 0) >= 10)

  const prepareMerge = (type: number) => {
    const toBurn: InventoryFruit[] = []
    for (let i = inventoryFruits.length - 1; i >= 0; i--) {
        if (inventoryFruits[i].fruit_type === type) { toBurn.push(inventoryFruits[i]); if (toBurn.length === 10) break }
    }
    setFruitsToBurn(toBurn); setTargetFruitType(type); setShowConfirmModal(true)
  }

  const confirmMerge = async () => {
    if (!inventoryId || !account || targetFruitType === null) return
    setTxStatus('⏳ Merging...'); setShowConfirmModal(false)
    const totalWeight = fruitsToBurn.reduce((s, f) => s + f.weight, 0); const newWeight = Math.floor(totalWeight / 2)
    const res: InventoryFruit = { fruit_type: targetFruitType, rarity: calculateRarityFromWeight(targetFruitType, newWeight), weight: newWeight, originalIndex: -1 }
    
    try {
      const tx = new Transaction(); tx.setGasBudget(100000000)
      tx.moveCall({ target: `${PACKAGE_ID}::market::merge_fruits`, arguments: [tx.object(inventoryId), tx.pure.u8(targetFruitType), tx.pure.u64(1), tx.object(CLOCK_OBJECT)] })
      signAndExecute({ transaction: tx }, {
        onSuccess: async (r) => {
          await suiClient.waitForTransaction({ digest: r.digest }); setTxStatus('✅ Merge Successful!'); setResultFruit(res); setShowResultModal(true)
          if (onUpdate) onUpdate(); setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (err) => setTxStatus('❌ Failed: ' + err.message)
      })
    } catch (e) { setTxStatus('❌ Error') }
  }

  const getRarityColor = (r: number) => ['#a0a0a0', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f'][r-1] || '#a0a0a0'
  const getRarityName = (r: number) => ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][r-1] || 'Common'

  return (
    <div className="merge-container">
      {txStatus && <div className="tx-status-overlay">{txStatus}</div>}
      <div className="merge-layout">
        <div className="merchant-column">
          <div className="merchant-wrapper">
            <div className="speech-bubble">
              Bring me <strong>10 identical fruits</strong><br/>and I'll forge a <strong>LEGENDARY</strong> one!
            </div>
            <img src={mergeMan} alt="Merge Man" className="merge-man-img" />
          </div>
        </div>
        <div className="merge-list-column">
          <h2 className="section-title">Ready to Merge</h2>
          {mergeableFruits.length === 0 ? (
            <div className="empty-merge-state">🤷‍♂️<p>No fruits ready yet.</p></div>
          ) : (
            <div className="merge-grid">
              {mergeableFruits.map((f) => (
                <div key={f.level} className="merge-card">
                  <div className="merge-info">
                    <div className="fruit-preview">
                      <img src={f.image} alt={f.name} className="merge-fruit-img" style={{ width: '40px' }} />
                      <span className="fruit-count-badge">{groupedFruits[f.level]}</span>
                    </div>
                    <div className="merge-details"><h3>{f.name}</h3><p>Merge 10 ➔ 1 Heavy {f.name}</p></div>
                  </div>
                  <button className="merge-btn" onClick={() => prepareMerge(f.level)} disabled={isPending}>{isPending ? '⏳' : 'MERGE'}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>⚠️ Confirm Merge</h3>
            <p>The following 10 fruits will be merged:</p>
            <div className="burn-list">
              {fruitsToBurn.map((f, i) => (
                <div key={i} className="burn-item" style={{ borderColor: getRarityColor(f.rarity) }}>
                  <img src={FRUITS.find(fr => fr.level === f.fruit_type)?.image} style={{ width: '30px' }} />
                  <span className="burn-weight">{f.weight}g</span>
                  <span className="burn-rarity" style={{ color: getRarityColor(f.rarity) }}>{getRarityName(f.rarity)}</span>
                </div>
              ))}
            </div>
            {fruitsToBurn.some(f => f.rarity >= 3) && <div className="warning-box"><strong>WARNING:</strong> Merging Rare+ fruits!</div>}
            <p className="summary-text">Total: {fruitsToBurn.reduce((a,b)=>a+b.weight,0)}g ➔ New: ~{Math.floor(fruitsToBurn.reduce((a,b)=>a+b.weight,0)/2)}g</p>
            <div className="modal-actions"><button onClick={() => setShowConfirmModal(false)}>Cancel</button><button className="confirm-btn" onClick={confirmMerge}>Confirm</button></div>
          </div>
        </div>
      )}

      {showResultModal && resultFruit && (
        <div className="modal-overlay" onClick={() => setShowResultModal(false)}>
          <div className="modal-content result-modal" onClick={e => e.stopPropagation()}>
            <div className="shine-effect"></div>
            <h3>✨ MERGE SUCCESS! ✨</h3>
            <div className="result-card" style={{ borderColor: getRarityColor(resultFruit.rarity), boxShadow: `0 0 30px ${getRarityColor(resultFruit.rarity)}` }}>
              <img src={FRUITS.find(f => f.level === resultFruit.fruit_type)?.image} style={{ width: '80px' }} />
              <h4>{FRUITS.find(f => f.level === resultFruit.fruit_type)?.name}</h4>
              <div className="result-stats">
                <span className="res-pill weight">{resultFruit.weight}g</span>
                <span className="res-pill rarity" style={{ background: getRarityColor(resultFruit.rarity) }}>{getRarityName(resultFruit.rarity)}</span>
              </div>
            </div>
            <button className="confirm-btn" onClick={() => setShowResultModal(false)}>Awesome!</button>
          </div>
        </div>
      )}
      <style>{`
        .merge-container { max-width: 1000px; margin: 0 auto; padding: 20px; color: white; }
        .merge-layout { display: flex; gap: 60px; min-height: 500px; align-items: flex-end; }
        
        .merchant-column { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; position: relative; }
        .merchant-wrapper { position: relative; width: 100%; max-width: 350px; display: flex; justify-content: center; }
        
        .merge-man-img { 
          width: 100%; 
          height: auto; 
          filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4));
        }

        .speech-bubble {
          position: absolute;
          top: -80px;
          right: -40px;
          background: #fff;
          color: #2c3e50;
          padding: 15px 20px;
          border-radius: 20px;
          border: 4px solid #2c3e50;
          font-weight: 700;
          font-size: 0.95rem;
          line-height: 1.4;
          box-shadow: 8px 8px 0 rgba(0,0,0,0.2);
          z-index: 10;
          width: 220px;
          text-align: center;
        }

        .speech-bubble::after {
          content: '';
          position: absolute;
          bottom: -15px;
          left: 30px;
          border-width: 15px 15px 0;
          border-style: solid;
          border-color: #2c3e50 transparent;
          display: block;
          width: 0;
        }
        
        .speech-bubble::before {
          content: '';
          position: absolute;
          bottom: -9px;
          left: 34px;
          border-width: 11px 11px 0;
          border-style: solid;
          border-color: #fff transparent;
          display: block;
          width: 0;
          z-index: 1;
        }

        .merge-list-column { flex: 2; background: rgba(0, 0, 0, 0.2); border-radius: 24px; padding: 20px; border: 4px solid #2c3e50; }
        .section-title { font-size: 1.5rem; text-transform: uppercase; margin-bottom: 20px; color: #f1c40f; text-shadow: 2px 2px 0 #000; }
        .merge-grid { display: grid; gap: 15px; }
        .merge-card { display: flex; align-items: center; justify-content: space-between; background: #fff9e3; padding: 15px 20px; border-radius: 16px; border: 3px solid #2c3e50; box-shadow: 4px 4px 0 rgba(0,0,0,0.1); color: #2c3e50; }
        .merge-info { display: flex; align-items: center; gap: 15px; }
        .fruit-preview { position: relative; width: 60px; height: 60px; background: #fff; border: 2px solid #bdc3c7; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .fruit-count-badge { position: absolute; top: -8px; right: -8px; background: #2ecc71; color: white; padding: 2px 8px; border-radius: 10px; border: 2px solid #2c3e50; font-size: 0.8rem; }
        .merge-details h3 { margin: 0; text-transform: uppercase; font-weight: 900; }
        .merge-btn { background: #f1c40f; border: 3px solid #fff; padding: 10px 20px; border-radius: 12px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 0 #d35400; transition: 0.1s; }
        .merge-btn:active { transform: translateY(4px); box-shadow: none; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(5px); }
        .confirm-modal { background: #fff9e3; padding: 30px; border-radius: 32px; width: 90%; max-width: 550px; border: 6px solid #2c3e50; box-shadow: 12px 12px 0 rgba(0,0,0,0.3); text-align: center; color: #2c3e50; position: relative; }
        .burn-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 10px; margin: 20px 0; background: rgba(0,0,0,0.05); padding: 15px; border-radius: 20px; }
        .burn-item { background: #fff; border: 3px solid #bdc3c7; border-radius: 16px; padding: 10px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 4px 0 rgba(0,0,0,0.1); }
        .confirm-btn { background: #2ecc71; color: white; border: 3px solid #fff; padding: 12px 30px; border-radius: 16px; font-weight: 900; box-shadow: 0 6px 0 #27ae60; cursor: pointer; }
        .confirm-btn:active { transform: translateY(4px); box-shadow: none; }
        
        /* Result Modal Styles */
        .result-modal { 
          background: #fff9e3; 
          border: 6px solid #2c3e50; 
          border-radius: 32px; 
          padding: 40px; 
          width: 90%; 
          max-width: 450px; 
          text-align: center; 
          position: relative; 
          box-shadow: 15px 15px 0 rgba(0,0,0,0.3); 
          overflow: hidden; 
          animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        }
        
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        
        .shine-effect { 
          position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; 
          background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%); 
          animation: rotate 8s linear infinite; z-index: 0; opacity: 0.5;
        }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .result-modal h3 { position: relative; z-index: 2; font-size: 2.5rem; color: #f1c40f; text-shadow: 3px 3px 0 #d35400; margin-bottom: 20px; margin-top: 0; }
        
        .result-card { 
          background: white; border-radius: 24px; padding: 30px; margin: 20px auto; width: 240px; 
          border: 8px solid; position: relative; z-index: 2; 
          box-shadow: 0 10px 20px rgba(0,0,0,0.2); 
          transform: rotate(-2deg); transition: transform 0.3s;
        }
        .result-card:hover { transform: rotate(0) scale(1.05); }
        .result-card h4 { font-size: 1.8rem; text-transform: uppercase; margin: 10px 0; color: #2c3e50; font-weight: 900; }
        
        .result-stats { display: flex; flex-direction: column; gap: 8px; align-items: center; }
        .res-pill { padding: 6px 16px; border-radius: 12px; font-weight: 900; color: white; text-transform: uppercase; font-size: 1rem; border: 2px solid rgba(0,0,0,0.1); box-shadow: 0 3px 0 rgba(0,0,0,0.1); }
        .res-pill.weight { background: #e67e22; }
        
        .result-modal .confirm-btn { position: relative; z-index: 2; font-size: 1.2rem; padding: 15px 40px; background: linear-gradient(to bottom, #2ecc71, #27ae60); box-shadow: 0 6px 0 #1e8449; border: 3px solid #fff; }
        .result-modal .confirm-btn:active { transform: translateY(4px); box-shadow: 0 2px 0 #1e8449; }

        .tx-status-overlay { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #000; color: #f1c40f; padding: 10px 25px; border-radius: 30px; border: 2px solid #f1c40f; font-weight: bold; z-index: 1100; }

        @media (max-width: 768px) { 
          .merge-layout { flex-direction: column; gap: 20px; } 
          .merchant-column { display: none; } 
          .merge-list-column { width: 100%; padding: 10px; border: 2px solid #2c3e50; box-sizing: border-box; }
          .merge-card { padding: 10px; gap: 10px; box-sizing: border-box; }
          .merge-info { gap: 10px; flex: 1; min-width: 0; }
          .fruit-preview { width: 50px; height: 50px; flex-shrink: 0; }
          .merge-details h3 { font-size: 0.9rem; }
          .merge-details p { font-size: 0.7rem; }
          .merge-btn { padding: 8px 12px; font-size: 0.8rem; }
        }
      `}</style>
    </div>
  )
}
