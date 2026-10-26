// Procedurally generated dispenser. No external 3D files, no external textures, no environment HDRI downloads.
// Labels use drei <Html> (DOM overlays) rather than <Text>, so nothing is fetched from a font CDN.
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'

const COMPARTMENT_POSITIONS = {
  1: [-0.52, 0.55, 0.1],
  2: [0.52, 0.55, 0.1],
  3: [-0.52, -0.25, 0.1],
  4: [0.52, -0.25, 0.1],
}

function Compartment({ id, selected, active, onSelect }) {
  const glow = active ? 0.8 : selected ? 0.35 : 0
  const color = active ? '#5eead4' : selected ? '#99f6e4' : '#e2e8f0'
  return (
    <group position={COMPARTMENT_POSITIONS[id]}>
      <mesh
        onClick={(event) => { event.stopPropagation(); onSelect(id) }}
        onPointerOver={() => { document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'auto' }}
      >
        <boxGeometry args={[0.9, 0.65, 0.9]} />
        <meshStandardMaterial color={color} emissive="#14b8a6" emissiveIntensity={glow} transparent opacity={0.45} />
      </mesh>
      {[-0.25, 0, 0.25].map((x) => (
        <mesh key={x} position={[x, -0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.05, 0.12, 4, 10]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
    </group>
  )
}

function Label({ position, text }) {
  return (
    <Html position={position} center distanceFactor={9} zIndexRange={[10, 0]}>
      <div className="pointer-events-none whitespace-nowrap rounded bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow">
        {text}
      </div>
    </Html>
  )
}

function DispenserScene({ selectedId, onSelect, panelOpen, activeCompartment, dispensing, connected, showLabels }) {
  const panelRef = useRef()
  const wheelRef = useRef()
  const pillRef = useRef()
  const statusLedRef = useRef()
  const panelTarget = panelOpen ? -1.9 : 0

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (panelRef.current) {
      panelRef.current.rotation.y += (panelTarget - panelRef.current.rotation.y) * Math.min(1, delta * 6)
    }
    if (wheelRef.current && dispensing) wheelRef.current.rotation.y += delta * 6
    if (pillRef.current) {
      pillRef.current.visible = dispensing
      if (dispensing) pillRef.current.position.y = -0.85 - ((t * 1.2) % 1) * 0.45
    }
    if (statusLedRef.current) {
      statusLedRef.current.emissiveIntensity = dispensing ? 0.5 + 0.5 * Math.sin(t * 8) : 0.6
    }
  })

  return (
    <>
      <color attach="background" args={['#f1f5f9']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} />
      <pointLight position={[-4, 2, 4]} intensity={0.4} />

      {/* Base and enclosure */}
      <mesh position={[0, -1.56, 0]}>
        <boxGeometry args={[2.6, 0.12, 1.6]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh>
        <boxGeometry args={[2.4, 3, 1.4]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.3} depthWrite={false} />
      </mesh>

      {/* Transparent front panel on a hinge (click the compartments to inspect them) */}
      <group ref={panelRef} position={[-1.2, 0, 0.75]}>
        <mesh position={[1.2, 0, 0]}>
          <boxGeometry args={[2.4, 3, 0.05]} />
          <meshStandardMaterial color="#e0f2fe" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>

      {/* Compartments with pill-shaped medicine */}
      {Object.keys(COMPARTMENT_POSITIONS).map((key) => {
        const id = Number(key)
        return (
          <Compartment key={id} id={id} selected={selectedId === id} active={activeCompartment === id} onSelect={onSelect} />
        )
      })}

      {/* Motor and dispensing wheel. The group is rotated so the motor axis runs left to right. */}
      <group position={[0, -0.1, -0.5]} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.6, 16]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
        <mesh ref={wheelRef}>
          <cylinderGeometry args={[0.3, 0.3, 0.06, 12]} />
          <meshStandardMaterial color="#38bdf8" />
        </mesh>
      </group>

      {/* Chute, outlet tray, pill-drop sensor, and falling pill animation */}
      <mesh position={[0, -0.9, 0.45]}>
        <boxGeometry args={[0.4, 0.6, 0.4]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, -1.25, 0.85]}>
        <boxGeometry args={[1.1, 0.18, 0.6]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0.22, -0.95, 0.45]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color={connected ? '#22c55e' : '#94a3b8'} emissive={connected ? '#22c55e' : '#000000'} emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={pillRef} position={[0, -0.85, 0.45]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.06, 0.14, 4, 10]} />
        <meshStandardMaterial color="#fde68a" />
      </mesh>

      {/* Screen and speaker grille on the front face */}
      <mesh position={[0, 1.15, 0.73]}>
        <boxGeometry args={[1.0, 0.45, 0.02]} />
        <meshStandardMaterial color="#0f172a" emissive="#1e40af" emissiveIntensity={0.6} />
      </mesh>
      <group position={[-0.75, -0.95, 0.73]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, -0.1 + i * 0.07, 0]}>
            <boxGeometry args={[0.45, 0.02, 0.02]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        ))}
      </group>

      {/* ESP32 controller board (conceptual representation) */}
      <group position={[0.6, -1.2, -0.3]}>
        <mesh>
          <boxGeometry args={[0.7, 0.05, 0.5]} />
          <meshStandardMaterial color="#166534" />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.2, 0.05, 0.2]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      </group>

      {/* Status LEDs: power, network, status */}
      <mesh position={[0.85, 1.4, 0.74]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={connected ? 0.8 : 0.1} />
      </mesh>
      <mesh position={[0.95, 1.4, 0.74]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={connected ? 0.6 : 0.1} />
      </mesh>
      <mesh position={[1.05, 1.4, 0.74]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial ref={statusLedRef} color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} />
      </mesh>

      {showLabels && (
        <>
          <Label position={[0.6, -0.85, -0.3]} text="ESP32 controller" />
          <Label position={[0, 0.1, -1.0]} text="Motor" />
          <Label position={[0, -1.45, 0.95]} text="Dispensing outlet" />
          <Label position={[0, 1.6, 0.8]} text="Screen" />
          <Label position={[-0.75, -1.2, 0.8]} text="Speaker grille" />
          <Label position={[0.22, -0.7, 0.5]} text="Pill sensor" />
          <Label position={[0.95, 1.7, 0.8]} text="Status LEDs" />
        </>
      )}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={3} maxDistance={12} />
    </>
  )
}

export default function DispenserModel3D(props) {
  return (
    <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <Canvas camera={{ position: [4.2, 2.2, 6], fov: 40 }} dpr={[1, 2]}>
        <DispenserScene {...props} />
      </Canvas>
    </div>
  )
}
