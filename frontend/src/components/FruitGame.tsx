import { useEffect, useRef, useState, useCallback } from 'react'
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import Matter from 'matter-js'

const PACKAGE_ID = '0xe6d304e671b8fd270f8b5d978dfed1a9debd20ec20ea784e36fb872fa3a2b638'

// Fruit configurations
const FRUITS = [
  { level: 1, emoji: '🍒', radius: 20, color: '#e74c3c', name: 'Cherry' },
  { level: 2, emoji: '🍇', radius: 25, color: '#9b59b6', name: 'Grape' },
  { level: 3, emoji: '🍊', radius: 30, color: '#e67e22', name: 'Orange' },
  { level: 4, emoji: '🍋', radius: 35, color: '#f1c40f', name: 'Lemon' },
  { level: 5, emoji: '🍎', radius: 40, color: '#c0392b', name: 'Apple' },
  { level: 6, emoji: '🍐', radius: 45, color: '#27ae60', name: 'Pear' },
  { level: 7, emoji: '🍑', radius: 50, color: '#fd79a8', name: 'Peach' },
  { level: 8, emoji: '🍍', radius: 55, color: '#fdcb6e', name: 'Pineapple' },
  { level: 9, emoji: '🍈', radius: 60, color: '#00b894', name: 'Melon' },
  { level: 10, emoji: '🍉', radius: 70, color: '#55a3a3', name: 'Watermelon' },
]

interface GameState {
  score: number
  seedsPending: number
  isGameOver: boolean
  isClaiming: boolean
  dropsRemaining: number
  claimComplete: boolean // NEW: true when claim is done, cannot drop more
}

interface FruitGameProps {
  onSeedsHarvested?: (seeds: number) => void
}

export default function FruitGame({ onSeedsHarvested }: FruitGameProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction()
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Matter.Engine | null>(null)
  const renderRef = useRef<Matter.Render | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  
  const [nextFruit, setNextFruit] = useState(0)
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    seedsPending: 0,
    isGameOver: false,
    isClaiming: false,
    dropsRemaining: 0,
    claimComplete: false,
  })
  const [canDrop, setCanDrop] = useState(true)
  const [txStatus, setTxStatus] = useState<string>('')
  const [gameStarted, setGameStarted] = useState(false)
  
  const fruitsRef = useRef<Map<number, { body: Matter.Body; level: number; index: number; dropTime: number }>>(new Map())
  const fruitIndexCounter = useRef(0)

  // Calculate seeds based on fruit level (same as contract)
  const calculateSeeds = (level: number): number => {
    if (level <= 3) return 0
    if (level <= 5) return level - 3
    if (level <= 7) return level - 2
    return level
  }

  // Start claiming - requires 5 more drops before mint
  const startClaiming = () => {
    if (gameState.seedsPending === 0) return
    setGameState(prev => ({
      ...prev,
      isClaiming: true,
      dropsRemaining: 5,
    }))
  }

  // Harvest seeds on-chain - only after 5 drops during claim
  const harvestSeedsOnChain = async () => {
    if (!account?.address || gameState.seedsPending === 0 || gameState.dropsRemaining > 0) return
    
    setTxStatus('🌾 Minting seeds on-chain...')
    const tx = new Transaction()
    
    // Call mint_seeds with the amount earned
    tx.moveCall({
      target: `${PACKAGE_ID}::game::mint_seeds`,
      arguments: [
        tx.pure.u64(gameState.seedsPending),
      ],
    })

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (result) => {
          await suiClient.waitForTransaction({ digest: result.digest })
          const harvested = gameState.seedsPending
          onSeedsHarvested?.(harvested)
          
          // Reset game completely after successful mint
          if (engineRef.current) {
            for (const [, fruit] of fruitsRef.current) {
              Matter.Composite.remove(engineRef.current.world, fruit.body)
            }
            fruitsRef.current.clear()
            fruitIndexCounter.current = 0
          }
          
          setGameState({
            score: 0,
            seedsPending: 0,
            isGameOver: false,
            isClaiming: false,
            dropsRemaining: 0,
            claimComplete: false,
          })
          setGameStarted(false) // Must click to play again
          setTxStatus(`🎉 Minted ${harvested} seeds! Click to play again.`)
          setTimeout(() => setTxStatus(''), 3000)
        },
        onError: (error) => {
          console.error('Error minting seeds:', error)
          setTxStatus('Error: ' + error.message)
          setTimeout(() => setTxStatus(''), 5000)
        },
      }
    )
  }

  // Reset game locally
  const resetGame = () => {
    if (!engineRef.current) return
    
    // Clear all fruits
    for (const [, fruit] of fruitsRef.current) {
      Matter.Composite.remove(engineRef.current.world, fruit.body)
    }
    fruitsRef.current.clear()
    fruitIndexCounter.current = 0
    
    setGameState({
      score: 0,
      seedsPending: 0,
      isGameOver: false,
      isClaiming: false,
      dropsRemaining: 0,
      claimComplete: false,
    })
    setNextFruit(Math.floor(Math.random() * 3))
    setGameStarted(true)
  }

  // Start new game locally
  const startGame = () => {
    resetGame()
  }

  // Initialize Matter.js
  useEffect(() => {
    if (!canvasRef.current) return

    const width = 400
    const height = 600
    const wallThickness = 20

    const engine = Matter.Engine.create()
    engineRef.current = engine

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width,
        height,
        wireframes: false,
        background: '#1a1a2e',
      },
    })
    renderRef.current = render

    const walls = [
      Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width + wallThickness * 2, wallThickness, {
        isStatic: true,
        render: { fillStyle: '#4a4a6a' },
        label: 'wall',
      }),
      Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, {
        isStatic: true,
        render: { fillStyle: '#4a4a6a' },
        label: 'wall',
      }),
      Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, {
        isStatic: true,
        render: { fillStyle: '#4a4a6a' },
        label: 'wall',
      }),
    ]

    Matter.Composite.add(engine.world, walls)

    const gameOverLine = Matter.Bodies.rectangle(width / 2, 100, width, 2, {
      isStatic: true,
      isSensor: true,
      render: { fillStyle: '#e74c3c' },
      label: 'gameOverLine',
    })
    Matter.Composite.add(engine.world, gameOverLine)

    // Collision detection for merging
    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA
        const bodyB = pair.bodyB

        if (bodyA.label === 'wall' || bodyB.label === 'wall') continue
        if (bodyA.label === 'gameOverLine' || bodyB.label === 'gameOverLine') continue

        const fruitA = fruitsRef.current.get(bodyA.id)
        const fruitB = fruitsRef.current.get(bodyB.id)

        if (fruitA && fruitB && fruitA.level === fruitB.level && fruitA.level < 10) {
          const newLevel = fruitA.level + 1
          const midX = (bodyA.position.x + bodyB.position.x) / 2
          const midY = (bodyA.position.y + bodyB.position.y) / 2

          // Remove old fruits
          Matter.Composite.remove(engine.world, bodyA)
          Matter.Composite.remove(engine.world, bodyB)
          fruitsRef.current.delete(bodyA.id)
          fruitsRef.current.delete(bodyB.id)

          // Create new bigger fruit
          const newFruitConfig = FRUITS[newLevel - 1]
          const newBody = Matter.Bodies.circle(midX, midY, newFruitConfig.radius, {
            restitution: 0.3,
            friction: 0.5,
            render: { fillStyle: newFruitConfig.color },
            label: 'fruit',
          })
          
          const newIndex = fruitIndexCounter.current++
          fruitsRef.current.set(newBody.id, { body: newBody, level: newLevel, index: newIndex, dropTime: Date.now() })
          Matter.Composite.add(engine.world, newBody)

          // Update local game state
          const seeds = calculateSeeds(newLevel)
          setGameState((prev) => ({
            ...prev,
            score: prev.score + newLevel * 10,
            seedsPending: prev.seedsPending + seeds,
          }))
        }
      }
    })

    // Check for game over (fruit stays above red line for a while after settling)
    // Only check fruits that have been in play for at least 2 seconds
    Matter.Events.on(engine, 'afterUpdate', () => {
      const now = Date.now()
      for (const [, fruit] of fruitsRef.current) {
        // Fruit must: be above line, be slow (settled), and been dropped at least 2s ago
        const timeSinceDrop = now - fruit.dropTime
        if (timeSinceDrop > 2000 && // Wait 2 seconds after drop
            fruit.body.position.y < 120 && // Above danger zone
            Math.abs(fruit.body.velocity.y) < 1 && // Not moving much vertically
            Math.abs(fruit.body.velocity.x) < 1) { // Not moving much horizontally
          setGameState((prev) => {
            if (!prev.isGameOver) {
              return { ...prev, isGameOver: true }
            }
            return prev
          })
          break
        }
      }
    })

    const runner = Matter.Runner.create()
    runnerRef.current = runner
    Matter.Runner.run(runner, engine)
    Matter.Render.run(render)

    setNextFruit(Math.floor(Math.random() * 3))

    return () => {
      Matter.Render.stop(render)
      Matter.Runner.stop(runner)
      Matter.Engine.clear(engine)
      fruitsRef.current.clear()
    }
  }, [])

  // Drop fruit locally - FREE, no transaction!
  // KEY FIX: Cannot drop if claim is complete - must harvest or reset
  const dropFruit = useCallback(
    (x: number) => {
      // Block dropping if: no engine, cooldown, game over, not started, OR claim complete
      if (!engineRef.current || !canDrop || gameState.isGameOver || !gameStarted || gameState.claimComplete) return

      const fruit = FRUITS[nextFruit]
      const body = Matter.Bodies.circle(x, 50, fruit.radius, {
        restitution: 0.3,
        friction: 0.5,
        render: { fillStyle: fruit.color },
        label: 'fruit',
      })

      const newIndex = fruitIndexCounter.current++
      fruitsRef.current.set(body.id, { body, level: fruit.level, index: newIndex, dropTime: Date.now() })
      Matter.Composite.add(engineRef.current.world, body)

      // If in claiming mode, decrement drops remaining
      if (gameState.isClaiming && gameState.dropsRemaining > 0) {
        const newDropsRemaining = gameState.dropsRemaining - 1
        const isComplete = newDropsRemaining === 0
        setGameState(prev => ({
          ...prev,
          dropsRemaining: newDropsRemaining,
          claimComplete: isComplete, // Set claim complete when drops hit 0
        }))
      }

      setCanDrop(false)
      setTimeout(() => setCanDrop(true), 500)
      setNextFruit(Math.floor(Math.random() * 3))
    },
    [nextFruit, canDrop, gameState.isGameOver, gameState.claimComplete, gameStarted]
  )

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gameStarted) {
      startGame()
      return
    }
    // Block click if claim is complete (must harvest first)
    if (gameState.claimComplete) {
      return
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    dropFruit(x)
  }

  // Determine if dropping is allowed (for cursor style)
  const canDropNow = gameStarted && canDrop && !gameState.isGameOver && !gameState.claimComplete

  return (
    <div className="fruit-game">
      {/* Transaction Status */}
      {txStatus && (
        <div className="tx-status">
          {isPending && <span className="spinner">⏳</span>}
          {txStatus}
        </div>
      )}

      {/* Stats Panel */}
      <div className="game-stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{gameState.score}</span>
        </div>
        <div className="stat seeds">
          <span className="stat-label">🌱 Seeds</span>
          <span className="stat-value">{gameState.seedsPending}</span>
        </div>
      </div>

      {/* Next Fruit Preview - Hide when claim complete */}
      {gameStarted && !gameState.isGameOver && !gameState.claimComplete && (
        <div className="next-fruit">
          <span>Next: </span>
          <span className="fruit-emoji">{FRUITS[nextFruit].emoji}</span>
        </div>
      )}

      {/* Game Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ cursor: canDropNow ? 'pointer' : 'default' }}
        />
        
        {/* Start Screen */}
        {!gameStarted && !gameState.isGameOver && (
          <div className="game-overlay start-screen">
            <h2>🍉 Fruit Merge</h2>
            <p>Click to start!</p>
            <div className="instructions">
              <p>🍒 Drop fruits to merge</p>
              <p>🌱 Same fruits = bigger fruit + seeds</p>
              <p>🌾 Harvest to mint seeds on-chain</p>
            </div>
          </div>
        )}

        {/* Game Over */}
        {gameState.isGameOver && (
          <div className="game-overlay game-over">
            <h2>💥 Game Over!</h2>
            <p>Score: {gameState.score}</p>
            {gameState.seedsPending > 0 && !gameState.isClaiming && (
              <div className="harvest-prompt">
                <p>🌱 You had {gameState.seedsPending} seeds pending</p>
                <p className="lost-hint">Seeds lost! Start claim before game over next time.</p>
              </div>
            )}
            {gameState.isClaiming && gameState.dropsRemaining === 0 && gameState.seedsPending > 0 && (
              <div className="harvest-prompt">
                <p>🌱 Claim complete! {gameState.seedsPending} seeds ready!</p>
                {account ? (
                  <button 
                    className="btn-harvest" 
                    onClick={harvestSeedsOnChain} 
                    disabled={isPending}
                  >
                    {isPending ? 'Minting...' : '🌾 Mint Seeds On-Chain'}
                  </button>
                ) : (
                  <p className="connect-hint">Connect wallet to mint seeds</p>
                )}
              </div>
            )}
            <button className="btn-restart" onClick={resetGame}>
              🔄 Play Again
            </button>
          </div>
        )}
      </div>

      {/* Claiming Mode Overlay - show different message when complete */}
      {gameState.isClaiming && gameState.dropsRemaining > 0 && (
        <div className="claiming-banner">
          🎯 Drop {gameState.dropsRemaining} more fruits to claim {gameState.seedsPending} seeds!
        </div>
      )}
      
      {/* Claim Complete Banner - dropping is now blocked */}
      {gameState.claimComplete && !gameState.isGameOver && (
        <div className="claiming-banner complete">
          ✅ Claim complete! {gameState.seedsPending} seeds ready to mint. Dropping is blocked until you harvest.
        </div>
      )}

      {/* Harvest Button - Available during gameplay */}
      {gameStarted && !gameState.isGameOver && gameState.seedsPending > 0 && (
        <div className="harvest-during-game">
          {!gameState.isClaiming ? (
            // Not claiming yet - show Start Claim button
            account ? (
              <button 
                className="btn-claim-start" 
                onClick={startClaiming}
              >
                🌾 Claim {gameState.seedsPending} Seeds (5 drops)
              </button>
            ) : (
              <span className="hint">Connect wallet to claim seeds</span>
            )
          ) : gameState.claimComplete ? (
            // Claiming done - can mint now (dropping blocked)
            account ? (
              <button 
                className="btn-harvest" 
                onClick={harvestSeedsOnChain} 
                disabled={isPending}
              >
                {isPending ? '⏳ Minting...' : `✨ Mint ${gameState.seedsPending} Seeds Now!`}
              </button>
            ) : (
              <span className="hint">Connect wallet to mint seeds</span>
            )
          ) : (
            // Still need to drop more
            <span className="claiming-hint">Keep dropping fruits! {gameState.dropsRemaining} left</span>
          )}
        </div>
      )}

      {/* Fruit Legend */}
      <div className="fruit-legend">
        {FRUITS.slice(0, 5).map((f) => (
          <span key={f.level} title={`${f.name} (Lv${f.level})`}>{f.emoji}</span>
        ))}
        <span>→</span>
        <span title="Watermelon (Lv10)">🍉</span>
      </div>
    </div>
  )
}
