import { useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

// Preload model to avoid flickering
useGLTF.preload('/src/assets/img/cute_seed.glb')

function Model({ mouseControl = true }: { mouseControl?: boolean }) {
  // Load model
  const { scene } = useGLTF('/src/assets/img/cute_seed.glb')
  const ref = useRef<THREE.Group>(null)

  // Animation loop
  useFrame((state) => {
    if (!ref.current || !mouseControl) return

    // Get mouse position (-1 to 1)
    const x = state.mouse.x
    const y = state.mouse.y

    // Smoothly interpolate rotation to look at mouse
    // Target rotation: Look slightly towards mouse
    // x affects y-axis rotation (left/right)
    // y affects x-axis rotation (up/down)
    const targetRotationY = x * 0.5 // Limit rotation range
    const targetRotationX = -y * 0.5

    // Lerp current rotation to target rotation for smoothness
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotationY, 0.1)
    ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, targetRotationX, 0.1)
  })

  // Auto rotate if no mouse control (e.g. loading)
  useFrame((_, delta) => {
    if (!mouseControl && ref.current) {
      ref.current.rotation.y += delta * 0.5
    }
  })

  return <primitive object={scene} ref={ref} scale={2} position={[0, -0.5, 0]} />
}

interface Seed3DProps {
  className?: string
  style?: React.CSSProperties
  mouseControl?: boolean
}

export default function Seed3D({ className, style, mouseControl = true }: Seed3DProps) {
  return (
    <div className={className} style={{ width: '100px', height: '100px', ...style }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
        {/* Lighting setup */}
        <ambientLight intensity={0.7} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        {/* Environment reflection */}
        <Environment preset="city" />
        
        {/* The Seed Model */}
        <Model mouseControl={mouseControl} />
        
        {/* Shadows for realism */}
        <ContactShadows position={[0, -1.4, 0]} opacity={0.5} scale={10} blur={1.5} far={0.8} />
      </Canvas>
    </div>
  )
}
