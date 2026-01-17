import { useState, useEffect, useCallback, useRef } from 'react'
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction } from '../hooks/useSponsoredTransaction'

const PACKAGE_ID = '0x599868f3b4e190173c1ec1d3bd2738239461d617f74fe136a1a2f021fdf02503'
const LEADERBOARD_CONFIG_ID = '0xba8c7f6735c3f7d221c056a102be5afa413d444b4c296fb7db4a9f001397943c'
const JOIN_FEE_MIST = 10_000_000 // 0.01 SUI in MIST
const SUI_DECIMALS = 1_000_000_000 // 1 SUI = 10^9 MIST
const LEADERBOARD_ROUND_TYPE = `${PACKAGE_ID}::leaderboard::LeaderboardRound`

// Prize distribution percentages
const PRIZE_FIRST_PCT = 50
const PRIZE_SECOND_PCT = 25
const PRIZE_THIRD_PCT = 10

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

interface LeaderboardEntry {
  player: string
  best_weight: number
  last_updated: number
  joined_at: number
}

interface LeaderboardRound {
  objectId: string
  roundId: number
  fruitType: number
  startTime: number
  endTime: number
  participantCount: number
  isActive: boolean
  prizePool: number
  prizesDistributed: boolean
  firstPlace: string
  firstWeight: number
  secondPlace: string
  secondWeight: number
  thirdPlace: string
  thirdWeight: number
}

interface LeaderboardProps {
  inventoryId: string | null
  onUpdate?: () => void
}

export default function Leaderboard({ inventoryId, onUpdate }: LeaderboardProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  // Keep useSignAndExecuteTransaction for joinLeaderboard (requires SUI payment)
  const { mutate: signAndExecute, isPending: isJoinPending } = useSignAndExecuteTransaction()
  // Use sponsored transaction for other operations
  const { mutate: signAndExecuteSponsored, isPending: isSponsoredPending } = useSponsoredTransaction()
  const isPending = isJoinPending || isSponsoredPending
  
  const [currentRound, setCurrentRound] = useState<LeaderboardRound | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [txStatus, setTxStatus] = useState('')
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const [isAutoStarting, setIsAutoStarting] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-discover the latest LeaderboardRound by querying RoundCreated events
  const findLatestRound = useCallback(async (): Promise<string | null> => {
    try {
      const events = await suiClient.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::leaderboard::RoundCreated`
        },
        limit: 5,
        order: 'descending'
      })

      if (events.data.length === 0) {
        console.log('No RoundCreated events found')
        return null
      }

      // Get the transaction that created the latest round
      const latestEvent = events.data[0]
      const txDigest = latestEvent.id.txDigest
      
      // Get transaction details to find the created round object
      const txDetails = await suiClient.getTransactionBlock({
        digest: txDigest,
        options: { showObjectChanges: true }
      })

      // Find the LeaderboardRound object that was created
      const createdRound = txDetails.objectChanges?.find(
        (change: any) => change.type === 'created' && change.objectType === LEADERBOARD_ROUND_TYPE
      )

      if (createdRound && 'objectId' in createdRound) {
        console.log('Found latest round:', createdRound.objectId)
        return createdRound.objectId
      }

      return null
    } catch (err) {
      console.error('Error finding latest round:', err)
      return null
    }
  }, [suiClient])

  // Fetch current round data
  const fetchRoundData = useCallback(async (roundObjectId: string) => {
    try {
      const obj = await suiClient.getObject({
        id: roundObjectId,
        options: { showContent: true }
      })

      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as any
        const prizePoolData = fields.prize_pool?.fields || fields.prize_pool
        const round: LeaderboardRound = {
          objectId: roundObjectId,
          roundId: Number(fields.round_id || 0),
          fruitType: Number(fields.fruit_type || 1),
          startTime: Number(fields.start_time || 0),
          endTime: Number(fields.end_time || 0),
          participantCount: Number(fields.participant_count || 0),
          isActive: fields.is_active === true,
          prizePool: Number(prizePoolData?.value || 0),
          prizesDistributed: fields.prizes_distributed === true,
          firstPlace: fields.first_place || '0x0',
          firstWeight: Number(fields.first_weight || 0),
          secondPlace: fields.second_place || '0x0',
          secondWeight: Number(fields.second_weight || 0),
          thirdPlace: fields.third_place || '0x0',
          thirdWeight: Number(fields.third_weight || 0),
        }
        setCurrentRound(round)

        // Fetch entries from the table
        const entriesTable = fields.entries
        if (entriesTable?.fields?.id?.id) {
          await fetchEntries(entriesTable.fields.id.id, round.participantCount)
        }

        return round
      }
      return null
    } catch (err) {
      console.error('Failed to fetch round data:', err)
      return null
    }
  }, [suiClient])

  // Fetch leaderboard entries
  const fetchEntries = async (tableId: string, count: number) => {
    try {
      // For dynamic tables, we need to query dynamic fields
      const dynamicFields = await suiClient.getDynamicFields({
        parentId: tableId,
        limit: Math.min(count, 50)
      })

      const entriesData: LeaderboardEntry[] = []
      
      for (const field of dynamicFields.data) {
        const fieldObj = await suiClient.getDynamicFieldObject({
          parentId: tableId,
          name: field.name
        })
        
        if (fieldObj.data?.content?.dataType === 'moveObject') {
          const value = (fieldObj.data.content.fields as any).value?.fields || 
                        (fieldObj.data.content.fields as any).value
          if (value) {
            entriesData.push({
              player: value.player || field.name.value,
              best_weight: Number(value.best_weight || 0),
              last_updated: Number(value.last_updated || 0),
              joined_at: Number(value.joined_at || 0)
            })
          }
        }
      }

      // Sort by weight descending
      entriesData.sort((a, b) => b.best_weight - a.best_weight)
      setEntries(entriesData)

      // Find current user's entry
      if (account?.address) {
        const myEntryData = entriesData.find(e => e.player === account.address)
        setMyEntry(myEntryData || null)
      }
    } catch (err) {
      console.error('Failed to fetch entries:', err)
    }
  }

  // Create new round (auto-triggered when needed) - SPONSORED
  const createNewRound = useCallback(async () => {
    if (!account) {
      console.log('Cannot create round: wallet not connected')
      return null
    }

    setIsAutoStarting(true)
    setTxStatus('🎲 Starting new tournament...')
    
    return new Promise<string | null>((resolve) => {
      const tx = new Transaction()

      tx.moveCall({
        target: `${PACKAGE_ID}::leaderboard::create_new_round`,
        arguments: [
          tx.object(LEADERBOARD_CONFIG_ID),
          tx.object('0x6'), // Clock
          tx.object('0x8'), // Random
        ],
      })

      signAndExecuteSponsored(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('Create round result:', result)
            setTxStatus('✅ New tournament started!')
            // Wait a bit for the chain to update, then find the new round
            setTimeout(async () => {
              setTxStatus('')
              setIsAutoStarting(false)
              const newRoundId = await findLatestRound()
              if (newRoundId) {
                await fetchRoundData(newRoundId)
              }
              onUpdate?.()
              resolve(newRoundId)
            }, 2000)
          },
          onError: (err) => {
            console.error('Create round failed:', err)
            setTxStatus(`❌ Failed: ${err.message}`)
            setIsAutoStarting(false)
            resolve(null)
          }
        }
      )
    })
  }, [account, signAndExecuteSponsored, findLatestRound, fetchRoundData, onUpdate])

  // Join leaderboard
  const joinLeaderboard = async () => {
    if (!account || !inventoryId || !currentRound?.objectId) {
      setTxStatus('Missing required objects')
      return
    }

    setTxStatus('Joining leaderboard...')
    const tx = new Transaction()

    // Split 0.01 SUI for fee
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(JOIN_FEE_MIST)])

    tx.moveCall({
      target: `${PACKAGE_ID}::leaderboard::join_leaderboard`,
      arguments: [
        tx.object(currentRound.objectId),
        tx.object(inventoryId),
        coin,
        tx.object('0x6'), // Clock
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          setTxStatus('✅ Joined leaderboard!')
          console.log('Join result:', result)
          setTimeout(async () => {
            setTxStatus('')
            await fetchRoundData(currentRound.objectId)
            onUpdate?.()
          }, 2000)
        },
        onError: (err) => {
          console.error('Join failed:', err)
          setTxStatus(`❌ Failed: ${err.message}`)
        }
      }
    )
  }

  // Update entry (re-scan for heaviest fruit) - SPONSORED
  const updateEntry = async () => {
    if (!account || !inventoryId || !currentRound?.objectId) {
      setTxStatus('Missing required objects')
      return
    }

    setTxStatus('Updating entry...')
    const tx = new Transaction()

    tx.moveCall({
      target: `${PACKAGE_ID}::leaderboard::update_entry`,
      arguments: [
        tx.object(currentRound.objectId),
        tx.object(inventoryId),
        tx.object('0x6'), // Clock
      ],
    })

    signAndExecuteSponsored(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          setTxStatus('✅ Entry updated!')
          console.log('Update result:', result)
          setTimeout(async () => {
            setTxStatus('')
            await fetchRoundData(currentRound.objectId)
            onUpdate?.()
          }, 2000)
        },
        onError: (err) => {
          console.error('Update failed:', err)
          setTxStatus(`❌ Failed: ${err.message}`)
        }
      }
    )
  }

  // Close round and distribute prizes (auto-triggered) - SPONSORED
  const closeRoundAndDistribute = useCallback(async () => {
    if (!account || !currentRound?.objectId) {
      return false
    }

    setTxStatus('💰 Distributing prizes...')
    
    return new Promise<boolean>((resolve) => {
      const tx = new Transaction()

      tx.moveCall({
        target: `${PACKAGE_ID}::leaderboard::close_round_and_distribute`,
        arguments: [
          tx.object(LEADERBOARD_CONFIG_ID),
          tx.object(currentRound.objectId),
          tx.object('0x6'), // Clock
        ],
      })

      signAndExecuteSponsored(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            setTxStatus('✅ Prizes distributed!')
            console.log('Close result:', result)
            setTimeout(async () => {
              setTxStatus('')
              await fetchRoundData(currentRound.objectId)
              onUpdate?.()
              resolve(true)
            }, 2000)
          },
          onError: (err) => {
            console.error('Close failed:', err)
            setTxStatus(`❌ Distribution failed: ${err.message}`)
            resolve(false)
          }
        }
      )
    })
  }, [account, currentRound, signAndExecuteSponsored, fetchRoundData, onUpdate])

  // Reset inventory after round ends - SPONSORED
  const resetInventory = async () => {
    if (!account || !inventoryId || !currentRound?.objectId) {
      setTxStatus('Missing required objects')
      return
    }

    setTxStatus('Resetting inventory for new round...')
    const tx = new Transaction()

    tx.moveCall({
      target: `${PACKAGE_ID}::leaderboard::reset_inventory_for_new_round`,
      arguments: [
        tx.object(currentRound.objectId),
        tx.object(inventoryId),
        tx.object('0x6'), // Clock
      ],
    })

    signAndExecuteSponsored(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          setTxStatus('✅ Inventory reset!')
          console.log('Reset result:', result)
          setTimeout(() => {
            setTxStatus('')
            onUpdate?.()
          }, 2000)
        },
        onError: (err) => {
          console.error('Reset failed:', err)
          setTxStatus(`❌ Failed: ${err.message}`)
        }
      }
    )
  }

  // Initialize: find latest round and check its status
  const initializeLeaderboard = useCallback(async () => {
    setIsLoading(true)
    try {
      const roundId = await findLatestRound()
      if (roundId) {
        const round = await fetchRoundData(roundId)
        
        // Check if round has ended and needs action
        if (round) {
          const now = Date.now()
          const roundEnded = now >= round.endTime || !round.isActive
          
          if (roundEnded && !round.prizesDistributed && round.participantCount > 0) {
            // Round ended but prizes not distributed - needs manual distribution
            console.log('Round ended, prizes need to be distributed')
          } else if (roundEnded && round.prizesDistributed) {
            // Round completed, auto-start new one
            console.log('Previous round completed, starting new one...')
            if (account) {
              await createNewRound()
            }
          }
        }
      } else {
        // No rounds exist yet, create the first one
        console.log('No rounds found, will create first round')
        if (account) {
          await createNewRound()
        }
      }
    } catch (err) {
      console.error('Error initializing leaderboard:', err)
    } finally {
      setIsLoading(false)
    }
  }, [findLatestRound, fetchRoundData, createNewRound, account])

  // Format SUI amount
  const formatSUI = (mist: number) => {
    const sui = mist / SUI_DECIMALS
    if (sui >= 1) {
      return `${sui.toFixed(4)} SUI`
    }
    return `${(sui * 1000).toFixed(2)} mSUI`
  }

  // Calculate prize amounts
  const calculatePrize = (pool: number, rank: number) => {
    if (rank === 1) return (pool * PRIZE_FIRST_PCT) / 100
    if (rank === 2) return (pool * PRIZE_SECOND_PCT) / 100
    if (rank === 3) return (pool * PRIZE_THIRD_PCT) / 100
    return 0
  }

  // Update time remaining
  useEffect(() => {
    if (!currentRound) return

    const updateTime = () => {
      const now = Date.now()
      const remaining = currentRound.endTime - now
      
      if (remaining <= 0) {
        setTimeRemaining('Round Ended')
        return
      }

      const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
      const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
      const seconds = Math.floor((remaining % (60 * 1000)) / 1000)

      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [currentRound])

  // Initialize leaderboard on mount and when account changes
  useEffect(() => {
    initializeLeaderboard()
  }, [initializeLeaderboard])

  // Periodic refresh (every 30 seconds)
  useEffect(() => {
    refreshIntervalRef.current = setInterval(async () => {
      if (currentRound?.objectId) {
        await fetchRoundData(currentRound.objectId)
      }
    }, 30000)
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [currentRound?.objectId, fetchRoundData])

  const getFruitInfo = (level: number) => FRUITS.find(f => f.level === level) || FRUITS[0]
  const fruitInfo = currentRound ? getFruitInfo(currentRound.fruitType) : null

  const formatWeight = (weight: number) => {
    if (weight >= 1000) {
      return `${(weight / 1000).toFixed(2)} kg`
    }
    return `${weight} g`
  }

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const isRoundActive = currentRound?.isActive && Date.now() < (currentRound?.endTime || 0)
  const needsPrizeDistribution = currentRound && !isRoundActive && !currentRound.prizesDistributed && currentRound.participantCount > 0

  // Loading state
  if (isLoading) {
    return (
      <div style={{ 
        padding: '1rem', 
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '12px',
        color: 'white',
        minHeight: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
          <div style={{ fontSize: '1.2rem', color: '#f39c12' }}>Loading Tournament...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      padding: '1rem', 
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      borderRadius: '12px',
      color: 'white',
      minHeight: '500px'
    }}>
      <h2 style={{ 
        textAlign: 'center', 
        marginBottom: '1.5rem',
        fontSize: '1.8rem',
        background: 'linear-gradient(90deg, #f39c12, #e74c3c)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        🏆 Weekly Leaderboard
      </h2>

      {/* Status Message */}
      {txStatus && (
        <div style={{
          textAlign: 'center',
          padding: '0.75rem',
          marginBottom: '1rem',
          background: txStatus.includes('❌') ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)',
          borderRadius: '8px',
          fontWeight: 'bold'
        }}>
          {txStatus}
        </div>
      )}

      {/* Auto-starting message */}
      {isAutoStarting && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(243,156,18,0.2)',
          borderRadius: '12px',
          marginBottom: '1rem',
          border: '2px solid #f39c12'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎲</div>
          <div style={{ fontWeight: 'bold' }}>Starting New Tournament...</div>
          <div style={{ fontSize: '0.9rem', color: '#888', marginTop: '0.5rem' }}>Please approve the transaction</div>
        </div>
      )}

      {/* No Round - Will auto-create */}
      {!currentRound && !isAutoStarting && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎮</div>
          <p style={{ color: '#888', marginBottom: '1rem' }}>No active tournament found</p>
          {account ? (
            <button
              onClick={createNewRound}
              disabled={isPending}
              style={{
                padding: '1rem 2rem',
                background: 'linear-gradient(90deg, #f39c12, #e74c3c)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1rem',
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.5 : 1
              }}
            >
              🎲 Start Tournament
            </button>
          ) : (
            <p style={{ color: '#f39c12' }}>Connect wallet to start a tournament</p>
          )}
        </div>
      )}

      {/* Current Round Info */}
      {currentRound && (
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          border: isRoundActive ? '2px solid #2ecc71' : needsPrizeDistribution ? '2px solid #f39c12' : '2px solid #9b59b6'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Round #{currentRound.roundId}</span>
              <h3 style={{ margin: '0.25rem 0', fontSize: '1.5rem' }}>
                {fruitInfo?.emoji} {fruitInfo?.name} Competition
              </h3>
            </div>
            <div style={{
              padding: '0.5rem 1rem',
              background: isRoundActive ? '#2ecc71' : currentRound.prizesDistributed ? '#9b59b6' : '#f39c12',
              borderRadius: '20px',
              fontSize: '0.9rem',
              fontWeight: 'bold'
            }}>
              {isRoundActive ? '🟢 ACTIVE' : currentRound.prizesDistributed ? '💰 COMPLETED' : '⏰ AWAITING PRIZES'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Time Remaining</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f39c12' }}>{timeRemaining}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Participants</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{currentRound.participantCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Join Fee</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>0.01 SUI</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Prize Pool</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2ecc71' }}>{formatSUI(currentRound.prizePool)}</div>
            </div>
          </div>

          {/* Prize Distribution Preview */}
          {currentRound.prizePool > 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px'
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#f1c40f' }}>🏆 Prize Distribution</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, rgba(241,196,15,0.3), rgba(230,126,34,0.3))',
                  borderRadius: '8px',
                  border: '1px solid #f39c12'
                }}>
                  <div style={{ fontSize: '1.5rem' }}>🥇</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>1st Place (50%)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f39c12' }}>
                    {formatSUI(calculatePrize(currentRound.prizePool, 1))}
                  </div>
                  {currentRound.firstPlace !== '0x0' && currentRound.firstWeight > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.25rem' }}>
                      {formatAddress(currentRound.firstPlace)} • {formatWeight(currentRound.firstWeight)}
                    </div>
                  )}
                </div>
                <div style={{ 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, rgba(189,195,199,0.3), rgba(149,165,166,0.3))',
                  borderRadius: '8px',
                  border: '1px solid #bdc3c7'
                }}>
                  <div style={{ fontSize: '1.5rem' }}>🥈</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>2nd Place (25%)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#bdc3c7' }}>
                    {formatSUI(calculatePrize(currentRound.prizePool, 2))}
                  </div>
                  {currentRound.secondPlace !== '0x0' && currentRound.secondWeight > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.25rem' }}>
                      {formatAddress(currentRound.secondPlace)} • {formatWeight(currentRound.secondWeight)}
                    </div>
                  )}
                </div>
                <div style={{ 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, rgba(230,126,34,0.3), rgba(211,84,0,0.3))',
                  borderRadius: '8px',
                  border: '1px solid #e67e22'
                }}>
                  <div style={{ fontSize: '1.5rem' }}>🥉</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>3rd Place (10%)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#e67e22' }}>
                    {formatSUI(calculatePrize(currentRound.prizePool, 3))}
                  </div>
                  {currentRound.thirdPlace !== '0x0' && currentRound.thirdWeight > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.25rem' }}>
                      {formatAddress(currentRound.thirdPlace)} • {formatWeight(currentRound.thirdWeight)}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#888', textAlign: 'center' }}>
                Owner: 10% • Treasury: 5%
              </div>
            </div>
          )}

          {/* Prize Distribution Alert */}
          {needsPrizeDistribution && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(243,156,18,0.2)',
              borderRadius: '8px',
              border: '1px solid #f39c12',
              textAlign: 'center'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>⏰ Tournament Ended!</div>
              <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '0.75rem' }}>
                Click below to distribute prizes to winners
              </div>
              <button
                onClick={closeRoundAndDistribute}
                disabled={isPending}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(90deg, #f39c12, #e74c3c)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.5 : 1
                }}
              >
                💰 Distribute Prizes & Start New Round
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {currentRound && isRoundActive && (
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {!myEntry && (
            <button
              onClick={joinLeaderboard}
              disabled={isPending || !inventoryId}
              style={{
                padding: '1rem 2rem',
                background: 'linear-gradient(90deg, #2ecc71, #27ae60)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1rem',
                cursor: isPending || !inventoryId ? 'not-allowed' : 'pointer',
                opacity: isPending || !inventoryId ? 0.5 : 1
              }}
            >
              💰 Join Tournament (0.01 SUI)
            </button>
          )}
          
          {myEntry && (
            <button
              onClick={updateEntry}
              disabled={isPending}
              style={{
                padding: '1rem 2rem',
                background: 'linear-gradient(90deg, #3498db, #2980b9)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1rem',
                cursor: isPending ? 'not-allowed' : 'pointer'
              }}
            >
              🔄 Update My Score
            </button>
          )}
        </div>
      )}

      {/* My Entry */}
      {myEntry && currentRound && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(52,152,219,0.3), rgba(41,128,185,0.3))',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '2px solid #3498db'
        }}>
          <h4 style={{ marginBottom: '0.5rem' }}>📍 Your Entry</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Best {fruitInfo?.name} Weight</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f39c12' }}>
                {fruitInfo?.emoji} {formatWeight(myEntry.best_weight)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8rem', color: '#888' }}>Current Rank</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                #{entries.findIndex(e => e.player === account?.address) + 1}
              </div>
            </div>
          </div>
          
          {/* Reset Inventory button when tournament is completed */}
          {currentRound.prizesDistributed && (
            <button
              onClick={resetInventory}
              disabled={isPending}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.75rem',
                background: 'linear-gradient(90deg, #e74c3c, #c0392b)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                cursor: isPending ? 'not-allowed' : 'pointer'
              }}
            >
              🗑️ Clear Inventory for Next Tournament
            </button>
          )}
        </div>
      )}

      {/* Leaderboard Table */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <h4 style={{ 
          padding: '1rem', 
          margin: 0, 
          background: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          🏅 Rankings
        </h4>
        
        {entries.length > 0 ? (
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {entries.map((entry, index) => (
              <div
                key={entry.player}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '1rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: entry.player === account?.address ? 'rgba(52,152,219,0.2)' : 'transparent'
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '1.2rem',
                  background: index === 0 ? 'linear-gradient(135deg, #f39c12, #e74c3c)' :
                             index === 1 ? 'linear-gradient(135deg, #bdc3c7, #95a5a6)' :
                             index === 2 ? 'linear-gradient(135deg, #e67e22, #d35400)' :
                             'rgba(255,255,255,0.1)',
                  marginRight: '1rem'
                }}>
                  {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold' }}>
                    {formatAddress(entry.player)}
                    {entry.player === account?.address && (
                      <span style={{ marginLeft: '0.5rem', color: '#3498db', fontSize: '0.8rem' }}>(You)</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    Last updated: {new Date(entry.last_updated).toLocaleString()}
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f39c12' }}>
                    {fruitInfo?.emoji} {formatWeight(entry.best_weight)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
            No participants yet. Be the first to join!
          </div>
        )}
      </div>

      {/* Instructions */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'rgba(241,196,15,0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(241,196,15,0.3)'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#f1c40f' }}>📋 How to Play</h4>
        <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#bbb', lineHeight: '1.6' }}>
          <li>Pay <strong>0.01 SUI</strong> to join the weekly competition</li>
          <li>Grow and merge <strong>{fruitInfo?.emoji} {fruitInfo?.name}s</strong> in your land</li>
          <li>Your <strong>heaviest</strong> fruit of this type auto-submits to leaderboard</li>
          <li>Click "Update My Entry" after merging to refresh your score</li>
          <li>Top players win when the round ends!</li>
          <li>⚠️ <strong>All fruits & seeds are deleted</strong> when round closes</li>
        </ol>
      </div>
    </div>
  )
}
