import { useState, useEffect, useCallback, useRef } from 'react'
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction } from '../hooks/useSponsoredTransaction'

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

const PACKAGE_ID = '0x599868f3b4e190173c1ec1d3bd2738239461d617f74fe136a1a2f021fdf02503'
const LEADERBOARD_CONFIG_ID = '0xba8c7f6735c3f7d221c056a102be5afa413d444b4c296fb7db4a9f001397943c'
const JOIN_FEE_MIST = 10_000_000 
const SUI_DECIMALS = 1_000_000_000
const LEADERBOARD_ROUND_TYPE = `${PACKAGE_ID}::leaderboard::LeaderboardRound`

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

interface LeaderboardEntry { player: string; best_weight: number; last_updated: number; joined_at: number }
interface LeaderboardRound {
  objectId: string; roundId: number; fruitType: number; startTime: number; endTime: number; participantCount: number;
  isActive: boolean; prizePool: number; prizesDistributed: boolean; firstPlace: string; firstWeight: number;
  secondPlace: string; secondWeight: number; thirdPlace: string; thirdWeight: number;
}

interface LeaderboardProps { inventoryId: string | null; onUpdate?: () => void }

export default function Leaderboard({ inventoryId, onUpdate }: LeaderboardProps) {
  const account = useCurrentAccount(); const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending: isJoinPending } = useSignAndExecuteTransaction()
  const { mutate: signAndExecuteSponsored, isPending: isSponsoredPending } = useSponsoredTransaction()
  const isPending = isJoinPending || isSponsoredPending
  
  const [currentRound, setCurrentRound] = useState<LeaderboardRound | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true); const [txStatus, setTxStatus] = useState('')
  const [timeRemaining, setTimeRemaining] = useState<string>(''); const [isAutoStarting, setIsAutoStarting] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const findLatestRound = useCallback(async (): Promise<string | null> => {
    try {
      const events = await suiClient.queryEvents({ query: { MoveEventType: `${PACKAGE_ID}::leaderboard::RoundCreated` }, limit: 1, order: 'descending' })
      if (events.data.length === 0) return null
      const txDetails = await suiClient.getTransactionBlock({ digest: events.data[0].id.txDigest, options: { showObjectChanges: true } })
      const createdRound = txDetails.objectChanges?.find((c: any) => c.type === 'created' && c.objectType === LEADERBOARD_ROUND_TYPE)
      return (createdRound && 'objectId' in createdRound) ? createdRound.objectId : null
    } catch (err) { return null }
  }, [suiClient])

  const fetchRoundData = useCallback(async (roundObjectId: string) => {
    try {
      const obj = await suiClient.getObject({ id: roundObjectId, options: { showContent: true } })
      if (obj.data?.content?.dataType === 'moveObject') {
        const f = obj.data.content.fields as any
        const p = f.prize_pool?.fields || f.prize_pool
        const round: LeaderboardRound = {
          objectId: roundObjectId, roundId: Number(f.round_id), fruitType: Number(f.fruit_type),
          startTime: Number(f.start_time), endTime: Number(f.end_time), participantCount: Number(f.participant_count),
          isActive: f.is_active === true, prizePool: Number(p?.value || 0), prizesDistributed: f.prizes_distributed === true,
          firstPlace: f.first_place, firstWeight: Number(f.first_weight), secondPlace: f.second_place,
          secondWeight: Number(f.second_weight), thirdPlace: f.third_place, thirdWeight: Number(f.third_weight),
        }
        setCurrentRound(round)
        if (f.entries?.fields?.id?.id) await fetchEntries(f.entries.fields.id.id, round.participantCount)
        return round
      }
    } catch (err) { return null }
  }, [suiClient])

  const fetchEntries = async (tableId: string, count: number) => {
    try {
      const fields = await suiClient.getDynamicFields({ parentId: tableId, limit: 50 })
      const data: LeaderboardEntry[] = []
      
      for (const f of fields.data) {
        const obj = await suiClient.getDynamicFieldObject({ parentId: tableId, name: f.name })
        
        if (obj.data?.content?.dataType === 'moveObject') {
          // Robust extraction logic
          const contentFields = obj.data.content.fields as any
          // The 'value' might be directly in fields, or nested inside 'value.fields', or simply 'value'
          const val = contentFields.value?.fields || contentFields.value || contentFields
          
          // Ensure we have the required fields before pushing
          if (val && (val.player || f.name.value)) {
             data.push({ 
               player: val.player || f.name.value, // Fallback to field name if player field is missing
               best_weight: Number(val.best_weight || 0), 
               last_updated: Number(val.last_updated || 0), 
               joined_at: Number(val.joined_at || 0) 
             })
          }
        }
      }
      
      // Deduplicate logic
      const uniqueMap = new Map<string, LeaderboardEntry>()
      data.forEach(e => {
         const existing = uniqueMap.get(e.player)
         if (!existing || e.best_weight > existing.best_weight) uniqueMap.set(e.player, e)
      })
      const uniqueEntries = Array.from(uniqueMap.values())
      
      uniqueEntries.sort((a, b) => b.best_weight - a.best_weight)
      setEntries(uniqueEntries)
      
      if (account?.address) {
        // Case-insensitive search
        const myAddr = account.address.toLowerCase()
        const myEntryData = uniqueEntries.find(e => e.player === account.address || e.player.toLowerCase() === myAddr)
        setMyEntry(myEntryData || null)
      }
    } catch (err) { console.error("Fetch entries error:", err) }
  }

  const createNewRound = useCallback(async () => {
    if (!account) return null
    setIsAutoStarting(true); setTxStatus('🎲 Creating Round...')
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::leaderboard::create_new_round`, arguments: [tx.object(LEADERBOARD_CONFIG_ID), tx.object('0x6'), tx.object('0x8')] })
    signAndExecuteSponsored({ transaction: tx }, {
      onSuccess: async () => {
        setTxStatus('✅ New Tournament Started!')
        setTimeout(async () => {
          setTxStatus(''); setIsAutoStarting(false); const id = await findLatestRound();
          if (id) await fetchRoundData(id); onUpdate?.()
        }, 2000)
      },
      onError: (err) => { setTxStatus(`❌ Failed: ${err.message}`); setIsAutoStarting(false) }
    })
  }, [account, signAndExecuteSponsored, findLatestRound, fetchRoundData, onUpdate])

  const joinLeaderboard = async () => {
    if (!account || !inventoryId || !currentRound) return
    setTxStatus('💰 Joining...')
    const tx = new Transaction(); const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(JOIN_FEE_MIST)])
    tx.moveCall({ target: `${PACKAGE_ID}::leaderboard::join_leaderboard`, arguments: [tx.object(currentRound.objectId), tx.object(inventoryId), coin, tx.object('0x6')] })
    signAndExecute({ transaction: tx }, {
      onSuccess: () => { setTxStatus('✅ Joined!'); setTimeout(() => { setTxStatus(''); fetchRoundData(currentRound.objectId); onUpdate?.() }, 2000) },
      onError: (err) => setTxStatus(`❌ Failed: ${err.message}`)
    })
  }

  const updateEntry = async () => {
    if (!account || !inventoryId || !currentRound) return
    setTxStatus('🔄 Updating Score...')
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::leaderboard::update_entry`, arguments: [tx.object(currentRound.objectId), tx.object(inventoryId), tx.object('0x6')] })
    signAndExecuteSponsored({ transaction: tx }, {
      onSuccess: () => { setTxStatus('✅ Score Updated!'); setTimeout(() => { setTxStatus(''); fetchRoundData(currentRound.objectId); onUpdate?.() }, 2000) },
      onError: (err) => setTxStatus(`❌ Failed: ${err.message}`)
    })
  }

  const closeRoundAndDistribute = async () => {
    if (!account || !currentRound) return
    setTxStatus('💰 Distributing Prizes...')
    const tx = new Transaction()
    tx.moveCall({ target: `${PACKAGE_ID}::leaderboard::close_round_and_distribute`, arguments: [tx.object(LEADERBOARD_CONFIG_ID), tx.object(currentRound.objectId), tx.object('0x6')] })
    signAndExecuteSponsored({ transaction: tx }, {
      onSuccess: () => { setTxStatus('✅ Prizes Distributed!'); setTimeout(() => { setTxStatus(''); fetchRoundData(currentRound.objectId); onUpdate?.() }, 2000) },
      onError: (err) => setTxStatus(`❌ Failed: ${err.message}`)
    })
  }

  useEffect(() => {
    const init = async () => { setIsLoading(true); const id = await findLatestRound(); if (id) await fetchRoundData(id); setIsLoading(false) }
    init()
  }, [findLatestRound, fetchRoundData])

  useEffect(() => {
    if (!currentRound) return
    const update = () => {
      const rem = currentRound.endTime - Date.now()
      if (rem <= 0) { setTimeRemaining('ENDED'); return }
      const h = Math.floor((rem / (60 * 60 * 1000))); const m = Math.floor((rem % (60 * 60 * 1000)) / (60 * 1000)); const s = Math.floor((rem % (60 * 1000)) / 1000)
      setTimeRemaining(`${h}h ${m}m ${s}s`)
    }
    update(); const iv = setInterval(update, 1000); return () => clearInterval(iv)
  }, [currentRound])

  const fruitInfo = currentRound ? FRUITS.find(f => f.level === currentRound.fruitType) : null
  const formatAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
  const formatW = (w: number) => w >= 1000 ? `${(w / 1000).toFixed(2)}kg` : `${w}g`
  const formatSUI = (m: number) => (m / SUI_DECIMALS).toFixed(3) + ' SUI'

  // Calculate Prize Pool manually: Participants * Fee * 0.9
  const displayPrizePool = currentRound ? (currentRound.participantCount * JOIN_FEE_MIST * 0.9) : 0

  // Check if user is already a participant
  const isParticipant = entries.some(e => e.player === account?.address)

  return (
    <div className="rank-container">
      {txStatus && <div className="tx-status-overlay">{txStatus}</div>}

      <div className="rank-header">
        <h1 className="rank-title">HALL OF FAME</h1>
        {currentRound && (
          <div className="round-info-badge">
            ROUND #{currentRound.roundId} • {timeRemaining}
          </div>
        )}
      </div>

      {!currentRound && !isAutoStarting && (
        <div className="no-round-state">
          <div className="no-round-icon">🤷‍♂️</div>
          <p>No tournament active</p>
          <button className="rank-btn primary" onClick={createNewRound}>START NEW SEASON</button>
        </div>
      )}

      {currentRound && (
        <>
          <div className="competition-target">
            <div className="target-card">
              <span className="target-label">Current Target:</span>
              <div className="target-fruit">
                <img src={fruitInfo?.image} alt={fruitInfo?.name} />
                <h3>{fruitInfo?.name}</h3>
              </div>
              <div className="target-prize">
                <span className="prize-label">Prize Pool:</span>
                <span className="prize-value">{formatSUI(displayPrizePool)}</span>
              </div>
            </div>
          </div>

          {/* TOP 3 PODIUM */}
          <div className="podium-container">
            {/* 2nd Place */}
            <div className="podium-item second">
              <div className="medal">🥈</div>
              <div className="podium-bar">
                <span className="addr">{entries[1] ? formatAddr(entries[1].player) : '---'}</span>
                <span className="weight">{entries[1] ? formatW(entries[1].best_weight) : ''}</span>
              </div>
              <div className="prize-tag highlight">{formatSUI(displayPrizePool * 0.25)}</div>
            </div>
            {/* 1st Place */}
            <div className="podium-item first">
              <div className="medal gold">🥇</div>
              <div className="podium-bar">
                <span className="addr">{entries[0] ? formatAddr(entries[0].player) : '---'}</span>
                <span className="weight">{entries[0] ? formatW(entries[0].best_weight) : ''}</span>
              </div>
              <div className="prize-tag gold-glow">{formatSUI(displayPrizePool * 0.50)}</div>
            </div>
            {/* 3rd Place */}
            <div className="podium-item third">
              <div className="medal">🥉</div>
              <div className="podium-bar">
                <span className="addr">{entries[2] ? formatAddr(entries[2].player) : '---'}</span>
                <span className="weight">{entries[2] ? formatW(entries[2].best_weight) : ''}</span>
              </div>
              <div className="prize-tag highlight">{formatSUI(displayPrizePool * 0.10)}</div>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="rank-actions">
            {!myEntry && currentRound.isActive && (
              <button className="rank-btn join" onClick={joinLeaderboard}>JOIN COMPETITION (0.01 SUI)</button>
            )}
            {myEntry && currentRound.isActive && (
              <button className="rank-btn update" onClick={updateEntry}>UPDATE MY SCORE</button>
            )}
            {!currentRound.isActive && !currentRound.prizesDistributed && (
              <button className="rank-btn distribute" onClick={closeRoundAndDistribute}>DISTRIBUTE PRIZES</button>
            )}
          </div>

          {/* LIST */}
          <div className="rank-list-wrapper">
            <h3 className="list-title">All Participants ({currentRound.participantCount})</h3>
            <div className="rank-list">
              {entries.map((e, i) => (
                <div key={e.player} className={`rank-row ${e.player === account?.address ? 'is-me' : ''}`}>
                  <div className="rank-num">#{i + 1}</div>
                  <div className="rank-player-info">
                    <span className="rank-addr">{formatAddr(e.player)} {e.player === account?.address && '(You)'}</span>
                    <span className="rank-date">{new Date(e.last_updated).toLocaleTimeString()}</span>
                  </div>
                  <div className="rank-score">{formatW(e.best_weight)}</div>
                </div>
              ))}
              {entries.length === 0 && <p className="no-entries">Be the first to join!</p>}
            </div>
          </div>
        </>
      )}

      <style>{`
        .rank-container { max-width: 800px; margin: 0 auto; color: #2c3e50; padding-bottom: 40px; }
        .rank-loading { text-align: center; padding: 100px; font-size: 1.5rem; color: #fff; font-weight: 900; }
        
        .rank-header { text-align: center; margin-bottom: 30px; }
        .rank-title { font-size: 3rem; font-weight: 950; color: #fff; text-shadow: 4px 4px 0 #3498db, 8px 8px 0 rgba(0,0,0,0.2); margin: 0; }
        .round-info-badge { display: inline-block; background: #2c3e50; color: #fff; padding: 5px 15px; border-radius: 20px; font-weight: 800; margin-top: 10px; font-size: 0.9rem; }

        /* Target Card */
        .competition-target { margin-bottom: 40px; display: flex; justify-content: center; }
        .target-card { background: #fff9e3; border: 6px solid #2c3e50; border-radius: 32px; padding: 20px 40px; display: flex; align-items: center; gap: 30px; box-shadow: 10px 10px 0 rgba(0,0,0,0.2); }
        .target-fruit { display: flex; flex-direction: column; align-items: center; }
        .target-fruit img { width: 60px; filter: drop-shadow(0 4px 0 rgba(0,0,0,0.1)); }
        .target-fruit h3 { margin: 5px 0 0 0; font-weight: 900; text-transform: uppercase; color: #e67e22; }
        .prize-value { display: block; font-size: 1.8rem; font-weight: 900; color: #2ecc71; }
        .target-label, .prize-label { font-size: 0.8rem; font-weight: 800; color: #7f8c8d; text-transform: uppercase; }

        /* Podium */
        .podium-container { display: flex; align-items: flex-end; justify-content: center; gap: 10px; margin-bottom: 40px; height: 250px; }
        .podium-item { display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 150px; }
        .podium-bar { width: 100%; border: 6px solid #2c3e50; border-bottom: none; border-radius: 20px 20px 0 0; display: flex; flex-direction: column; align-items: center; padding: 15px 5px; color: #fff; font-weight: 800; text-align: center; }
        .podium-item.first .podium-bar { height: 180px; background: #f1c40f; box-shadow: inset -8px 0 0 rgba(0,0,0,0.1); }
        .podium-item.second .podium-bar { height: 130px; background: #bdc3c7; box-shadow: inset -8px 0 0 rgba(0,0,0,0.1); }
        .podium-item.third .podium-bar { height: 100px; background: #e67e22; box-shadow: inset -8px 0 0 rgba(0,0,0,0.1); }
        .medal { font-size: 3rem; margin-bottom: -10px; z-index: 2; filter: drop-shadow(0 4px 0 rgba(0,0,0,0.2)); }
        .podium-bar .addr { font-size: 0.8rem; margin-bottom: 5px; background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: 10px; }
        .podium-bar .weight { font-size: 1.2rem; }
        
        .prize-tag { 
          font-size: 1rem; 
          font-weight: 900;
          padding: 5px 15px; 
          border-radius: 12px; 
          margin-top: 15px; 
          color: #fff;
          border: 3px solid #fff;
          box-shadow: 0 4px 0 rgba(0,0,0,0.2);
          text-shadow: 1px 1px 0 rgba(0,0,0,0.3);
          min-width: 100px;
          z-index: 5;
        }
        
        .prize-tag.highlight {
          background: linear-gradient(135deg, #3498db, #2980b9);
          box-shadow: 0 0 15px rgba(52, 152, 219, 0.5), 0 4px 0 #1c598a;
        }

        .prize-tag.gold-glow {
          background: linear-gradient(135deg, #f1c40f, #f39c12);
          box-shadow: 0 0 20px rgba(241, 196, 15, 0.6), 0 4px 0 #d35400;
          transform: scale(1.1);
          color: #2c3e50;
          border-color: #fff;
        }

        /* List */
        .rank-list-wrapper { background: rgba(0,0,0,0.2); border-radius: 32px; border: 4px solid #2c3e50; padding: 20px; }
        .list-title { color: #fff; margin-top: 0; font-weight: 900; text-transform: uppercase; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
        .rank-list { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding-right: 10px; }
        .rank-row { background: #fff9e3; border: 4px solid #2c3e50; border-radius: 16px; padding: 12px 20px; display: flex; align-items: center; box-shadow: 4px 4px 0 rgba(0,0,0,0.1); }
        .rank-row.is-me { border-color: #3498db; background: #e3f2fd; }
        .rank-num { font-size: 1.5rem; font-weight: 950; width: 50px; color: #7f8c8d; }
        .rank-player-info { flex: 1; display: flex; flex-direction: column; }
        .rank-addr { font-weight: 800; font-size: 1.1rem; }
        .rank-date { font-size: 0.7rem; color: #95a5a6; }
        .rank-score { font-size: 1.3rem; font-weight: 900; color: #e67e22; }

        /* Buttons */
        .rank-actions { display: flex; justify-content: center; gap: 15px; margin-bottom: 30px; }
        .rank-btn { padding: 15px 30px; border-radius: 20px; border: 4px solid #fff; font-weight: 900; font-size: 1.1rem; text-transform: uppercase; cursor: pointer; box-shadow: 0 6px 0 rgba(0,0,0,0.2); transition: all 0.1s; }
        .rank-btn:active { transform: translateY(4px); box-shadow: none; }
        .rank-btn.primary { background: #f1c40f; color: #2c3e50; }
        .rank-btn.join { background: #2ecc71; color: #fff; }
        .rank-btn.update { background: #3498db; color: #fff; }
        .rank-btn.distribute { background: #9b59b6; color: #fff; }

        .tx-status-overlay { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #000; color: #f1c40f; padding: 10px 25px; border-radius: 30px; border: 2px solid #f1c40f; font-weight: bold; z-index: 1100; }

        @media (max-width: 768px) {
          .target-card { flex-direction: column; gap: 10px; padding: 20px; }
          .podium-container { height: auto; align-items: center; flex-direction: column; }
          .podium-item { width: 100%; max-width: 100%; }
          .podium-bar { height: auto !important; border-radius: 20px; border-bottom: 6px solid #2c3e50; }
          .medal { margin-bottom: 0; font-size: 2rem; }
        }
      `}</style>
    </div>
  )
}