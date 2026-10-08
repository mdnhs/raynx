"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

import { cn } from "@/lib/utils"

// A "broken cube": a 3×3×3 grid of cells (indices -1..1 on each axis, +z
// faces the camera) packed with boxes that span one or more cells, so the
// stack is solid from every angle. Only the two front cells of the top layer
// are left empty for the stepped silhouette. Each piece gets a small fixed
// offset (jx/jy/jz) so the seams read as broken rather than gridded.
const CELL = 3
const SEAM = 0.18

type Piece = {
  x: [number, number]
  y: [number, number]
  z: [number, number]
  j?: [number, number, number]
}

const PIECES: Piece[] = [
  // top layer
  { x: [-1, -1], y: [1, 1], z: [-1, 1], j: [-0.1, 0.12, 0.25] }, // long bar
  { x: [0, 0], y: [1, 1], z: [-1, -1], j: [0, 0.2, 0] },
  { x: [1, 1], y: [1, 1], z: [-1, -1], j: [0.12, 0.05, -0.1] },
  { x: [0, 0], y: [1, 1], z: [0, 0], j: [0, -0.05, 0.08] },
  { x: [1, 1], y: [1, 1], z: [0, 0], j: [0.1, -0.12, 0] },
  // middle layer
  { x: [-1, -1], y: [0, 0], z: [-1, 0], j: [-0.15, 0, -0.1] },
  { x: [-1, -1], y: [0, 0], z: [1, 1], j: [-0.2, -0.05, 0.1] },
  { x: [0, 0], y: [0, 0], z: [1, 1], j: [0, 0.08, 0.25] }, // front cube
  { x: [1, 1], y: [0, 0], z: [1, 1], j: [0.1, 0, 0.1] },
  { x: [0, 1], y: [0, 0], z: [0, 0], j: [0.05, 0.05, 0] },
  { x: [0, 1], y: [0, 0], z: [-1, -1], j: [0.1, -0.08, -0.12] },
  // bottom layer
  { x: [-1, -1], y: [-1, -1], z: [1, 1], j: [-0.15, -0.1, 0.12] },
  { x: [0, 1], y: [-1, -1], z: [1, 1], j: [0.05, -0.15, 0.2] }, // wide front
  { x: [-1, -1], y: [-1, -1], z: [-1, 0], j: [-0.1, -0.1, -0.1] },
  { x: [0, 0], y: [-1, -1], z: [0, 0], j: [0, -0.05, 0] },
  { x: [1, 1], y: [-1, -1], z: [0, 0], j: [0.15, -0.1, 0.05] },
  { x: [0, 1], y: [-1, -1], z: [-1, -1], j: [0.08, -0.12, -0.15] },
]

const span = ([a, b]: [number, number]) => ({
  center: ((a + b) / 2) * CELL,
  size: (b - a + 1) * CELL - SEAM,
})

const BOX_CONFIGS = PIECES.map((p, i) => {
  const [jx, jy, jz] = p.j ?? [0, 0, 0]
  const x = span(p.x)
  const y = span(p.y)
  const z = span(p.z)
  return {
    x: x.center + jx,
    y: y.center + jy,
    z: z.center + jz,
    sx: x.size,
    sy: y.size,
    sz: z.size,
    speed: 0.6 + (i % 4) * 0.12,
  }
})

const PARTICLE_COUNT = 140
const BEVEL = 0.16
const BEVEL_SEGMENTS = 5
const RIM_GLOW = 0.6
// Striation lines per face; shared by the normal map and the glow map so the
// ridges and their light lines coincide.
const STRIATIONS = 56
// Radians of rotation per dragged pixel, and the pitch limit (~70°).
const DRAG_SPEED = 0.008
const MAX_PITCH = 1.2
const INNER_GLOW = 0.7
const BASE_FOV = 30
// Canvas size relative to its layout box (see HeroScene markup).
const OVERSCAN = 1.6
// Container aspect ratio (w/h) the camera framing was tuned for.
const FRAMED_ASPECT = 0.95

// Fine vertical ridges, the fluted/ribbed glass striations on every face.
function createStriationNormalMap() {
  const w = 512
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = 4
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(w, 4)
  const period = w / STRIATIONS
  for (let x = 0; x < w; x++) {
    // Slightly irregular phase so the lines don't look machine-perfect.
    const nx =
      Math.sin((x / period) * Math.PI * 2 + Math.sin(x * 0.03) * 0.5) * 0.5
    const nz = Math.sqrt(1 - nx * nx)
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4
      img.data[i] = (nx * 0.5 + 0.5) * 255
      img.data[i + 1] = 128
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

// What you see through each face of thick glass: a deep royal-blue body that
// gets lighter toward the edges (light piping through the slab), a brighter
// band along the top, and thin light striation lines.
function createInnerGlowMap() {
  const w = 512
  const h = 512
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!

  ctx.fillStyle = "#082a5e"
  ctx.fillRect(0, 0, w, h)

  // Light piping: each edge fades in a cyan-blue glow.
  const edge = (x0: number, y0: number, x1: number, y1: number, a: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(70,175,240,${a})`)
    g.addColorStop(0.35, `rgba(30,105,190,${a * 0.35})`)
    g.addColorStop(1, "rgba(24,90,190,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  edge(0, 0, 0, h * 0.4, 0.95) // top
  edge(0, h, 0, h * 0.7, 0.55) // bottom
  edge(0, 0, w * 0.3, 0, 0.6) // left
  edge(w, 0, w * 0.7, 0, 0.7) // right

  // Soft dark core so the middle of large faces stays deep.
  const core = ctx.createRadialGradient(
    w / 2,
    h * 0.55,
    0,
    w / 2,
    h * 0.55,
    w * 0.5
  )
  core.addColorStop(0, "rgba(2,8,28,0.55)")
  core.addColorStop(1, "rgba(2,8,28,0)")
  ctx.fillStyle = core
  ctx.fillRect(0, 0, w, h)

  // Striation lines.
  const period = w / STRIATIONS
  ctx.globalCompositeOperation = "lighter"
  for (let i = 0; i < STRIATIONS; i++) {
    ctx.fillStyle = `rgba(130,200,255,${0.1 + (i % 3) * 0.04})`
    ctx.fillRect(i * period, 0, 1.2, h)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

// Soft round sprite so particles read as light motes, not squares.
function createParticleTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext("2d")!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, "rgba(255,255,255,1)")
  g.addColorStop(0.25, "rgba(186,230,253,0.8)")
  g.addColorStop(1, "rgba(56,189,248,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Studio "softbox" environment: a big cyan light overhead (bright top faces),
// cool strips for edge catches, a warm strip for the orange glints and a
// near-black surround so side faces stay deep.
function createEnvScene() {
  const env = new THREE.Scene()
  env.background = new THREE.Color(0x01040a)
  const plane = new THREE.PlaneGeometry(1, 1)
  const materials: THREE.Material[] = []

  const add = (
    color: number,
    intensity: number,
    position: [number, number, number],
    scale: [number, number]
  ) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    })
    materials.push(material)
    const mesh = new THREE.Mesh(plane, material)
    mesh.position.set(...position)
    mesh.scale.set(scale[0], scale[1], 1)
    mesh.lookAt(0, 0, 0)
    env.add(mesh)
  }

  add(0x3cc8ff, 2.8, [-6, 14, -8], [34, 24]) // overhead softbox, angled back so top faces reflect it
  add(0x3aa8ff, 2.2, [12, 4, 8], [2.5, 12]) // right key strip
  add(0xff9a3c, 5, [-10, 6, 10], [1.4, 12]) // warm glint strip
  add(0x2a7fff, 1.0, [-6, 3, -12], [10, 4]) // back rim
  add(0x0b2a55, 0.6, [0, -10, 0], [20, 20]) // faint floor bounce
  add(0x1c5fc0, 0.3, [14, 2, -6], [14, 14]) // broad blue side wash
  add(0x2a7fd0, 0.22, [-4, 4, 16], [18, 10]) // front fill for side faces

  const dispose = () => {
    plane.dispose()
    materials.forEach((m) => m.dispose())
  }
  return { env, dispose }
}

// Additive highlight shell for the rounded edges. On a rounded box the bevel
// is where the object-space normal is not axis-aligned, so that drives a
// cyan edge catch. Upward-facing bevels (the top edges) also get the thin
// warm caustic line seen just inside the top edge of thick glass.
function createRimMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCyan: { value: new THREE.Color(0x7fdcff) },
      uWarm: { value: new THREE.Color(0xffb347) },
      uIntensity: { value: RIM_GLOW },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObjNormal;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vObjNormal = normal;
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCyan;
      uniform vec3 uWarm;
      uniform float uIntensity;
      varying vec3 vObjNormal;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vObjNormal);
        float flatness = max(max(abs(n.x), abs(n.y)), abs(n.z));
        float bevel = smoothstep(0.97, 0.8, flatness);
        float up = smoothstep(0.0, 0.6, n.y);
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float fresnel = pow(1.0 - facing, 4.0);

        // Warm line sits on the upper half of top-front bevels.
        float warm = up * bevel * smoothstep(0.35, 0.65, abs(n.x) + abs(n.z)) * 0.6;
        vec3 col = uCyan * bevel * (0.2 + 0.5 * up) + uWarm * warm + uCyan * fresnel * 0.18;
        col *= uIntensity;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

type Box = {
  group: THREE.Group
  shell: THREE.Mesh
  inner: THREE.MeshStandardMaterial
  rim: THREE.ShaderMaterial
  basePos: THREE.Vector3
  // Direction the box slides out along when hovered.
  outward: THREE.Vector3
  // GSAP-driven state, combined with the idle float every frame.
  state: { pop: number; glow: number }
  speed: number
  phase: number
}

export function HeroScene({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    const width = container.clientWidth || 650
    const height = container.clientHeight || 650

    const scene = new THREE.Scene()
    // Distant boxes sink into the page's navy, like the reference's falloff.
    scene.fog = new THREE.Fog(0x041026, 27, 44)

    // The canvas is OVERSCAN times larger than its layout box; widen the fov
    // by the same factor so the stack keeps its size but is never clipped.
    const fov =
      2 *
      THREE.MathUtils.radToDeg(
        Math.atan(OVERSCAN * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)))
      )
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000)
    // The framing is tuned for the desktop column's proportions. Narrower
    // (portrait) containers see less horizontally at the same vertical fov,
    // so pull the camera back along the same direction to keep the stack in.
    const cameraHome = new THREE.Vector3(15.5, 9, 19)
    const cameraTarget = new THREE.Vector3(0.4, 0, 0)
    const fitCamera = (aspect: number) => {
      const pullBack = Math.max(1, FRAMED_ASPECT / aspect)
      camera.position
        .copy(cameraHome)
        .sub(cameraTarget)
        .multiplyScalar(pullBack)
        .add(cameraTarget)
      camera.lookAt(cameraTarget)
    }
    fitCamera(camera.aspect)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.domElement.style.display = "block"
    container.appendChild(renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const studio = createEnvScene()
    const envTexture = pmrem.fromScene(studio.env, 0.02).texture
    scene.environment = envTexture

    // Direct lights add crisp highlights on top of the environment.
    const topLight = new THREE.DirectionalLight(0x8be9ff, 2.4)
    topLight.position.set(2, 20, 6)
    scene.add(topLight)

    const rimLight = new THREE.DirectionalLight(0x2f6bff, 2)
    rimLight.position.set(-18, 6, -12)
    scene.add(rimLight)

    // Materials
    const normalMap = createStriationNormalMap()
    const glowMap = createInnerGlowMap()
    const particleTexture = createParticleTexture()

    // Glass is two layers per box: an opaque inner back-face carrying the
    // light falloff, and a transmissive front shell that refracts it through
    // slightly frosted, striated, dispersive glass (soft, not mirror-crisp).
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xdaf0ff,
      roughness: 0.14,
      metalness: 0,
      transmission: 1,
      thickness: 2.5,
      ior: 1.5,
      dispersion: 5,
      attenuationColor: new THREE.Color(0x2e8fd0),
      attenuationDistance: 6,
      normalMap,
      normalScale: new THREE.Vector2(0.26, 0.26),
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 0.3,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [250, 600],
      specularIntensity: 1,
      specularColor: new THREE.Color(0xbfe8ff),
      envMapIntensity: 1.4,
    })

    const baseInner = new THREE.MeshStandardMaterial({
      color: 0x020818,
      emissive: 0xffffff,
      emissiveMap: glowMap,
      emissiveIntensity: INNER_GLOW,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.BackSide,
    })

    // Boxes
    const cluster = new THREE.Group()
    // Tilt the whole stack so it reads as a diagonal, like the reference.
    cluster.rotation.set(0.12, -0.18, 0.1)
    scene.add(cluster)

    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = [glass, baseInner]
    const center = new THREE.Vector3(0, 0, 0)

    const boxes: Box[] = BOX_CONFIGS.map((cfg) => {
      const group = new THREE.Group()

      const shellGeo = new RoundedBoxGeometry(
        cfg.sx,
        cfg.sy,
        cfg.sz,
        BEVEL_SEGMENTS,
        BEVEL
      )
      const rimGeo = new RoundedBoxGeometry(
        cfg.sx + 0.01,
        cfg.sy + 0.01,
        cfg.sz + 0.01,
        BEVEL_SEGMENTS,
        BEVEL
      )
      geometries.push(shellGeo, rimGeo)

      // Per-box clone so hover can light up a single box.
      const inner = baseInner.clone()
      const rim = createRimMaterial()
      materials.push(inner, rim)

      const shell = new THREE.Mesh(shellGeo, glass)
      group.add(new THREE.Mesh(shellGeo, inner))
      group.add(shell)
      group.add(new THREE.Mesh(rimGeo, rim))

      group.position.set(cfg.x, cfg.y, cfg.z)
      cluster.add(group)

      return {
        group,
        shell,
        inner,
        rim,
        basePos: group.position.clone(),
        outward: group.position.clone().sub(center).normalize(),
        state: { pop: 0, glow: 0 },
        speed: cfg.speed,
        phase: Math.random() * Math.PI * 2,
      }
    })

    // Floating light motes
    const partPositions = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
      partPositions[i] = (Math.random() - 0.5) * 26
      partPositions[i + 1] = (Math.random() - 0.5) * 22
      partPositions[i + 2] = (Math.random() - 0.5) * 22
    }
    const partGeo = new THREE.BufferGeometry()
    partGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(partPositions, 3)
    )
    geometries.push(partGeo)

    const partMat = new THREE.PointsMaterial({
      map: particleTexture,
      color: 0xbae6fd,
      size: 0.22,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    materials.push(partMat)
    const particles = new THREE.Points(partGeo, partMat)
    scene.add(particles)

    const render = () => renderer.render(scene, camera)

    // Pointer parallax, smoothed by GSAP.
    const tilt = { x: 0, y: 0 }
    const tiltX = gsap.quickTo(tilt, "x", { duration: 1.4, ease: "power3.out" })
    const tiltY = gsap.quickTo(tilt, "y", { duration: 1.4, ease: "power3.out" })

    // Hover: raycast against shells, slide the hovered box out and light it.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2(10, 10)
    const shells = boxes.map((b) => b.shell)
    let hovered: Box | null = null

    const setHovered = (next: Box | null) => {
      if (next === hovered) return
      if (hovered) {
        gsap.to(hovered.state, {
          pop: 0,
          glow: 0,
          duration: 0.9,
          ease: "power3.out",
        })
      }
      if (next) {
        gsap.to(next.state, {
          pop: 1,
          glow: 1,
          duration: 0.7,
          ease: "back.out(1.8)",
        })
      }
      hovered = next
    }

    // Drag to orbit: the stack sits in a spinner group so the drag rotation
    // composes with its base tilt. Yaw is unlimited (full 360°), pitch is
    // clamped so it never flips upside down. Release keeps some momentum.
    const spinner = new THREE.Group()
    scene.add(spinner)
    spinner.add(cluster)

    const canvas = renderer.domElement
    canvas.style.cursor = "grab"
    // Horizontal drags rotate; vertical swipes still scroll the page on touch.
    canvas.style.touchAction = "pan-y"
    canvas.style.userSelect = "none"

    const spin = { x: 0, y: 0 }
    const spinTarget = { x: 0, y: 0 }
    const spinX = gsap.quickTo(spin, "x", { duration: 0.8, ease: "power3.out" })
    const spinY = gsap.quickTo(spin, "y", { duration: 0.8, ease: "power3.out" })
    const applySpin = () => spinner.rotation.set(spin.x, spin.y, 0)

    let dragging = false
    let dragDistance = 0
    let lastX = 0
    let lastY = 0
    let lastTime = 0
    let velocity = 0

    const setSpin = () => {
      if (reduceMotion) {
        spin.x = spinTarget.x
        spin.y = spinTarget.y
        applySpin()
        render()
      } else {
        spinX(spinTarget.x)
        spinY(spinTarget.y)
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      // Stop the browser from starting a text selection or native drag.
      e.preventDefault()
      dragging = true
      dragDistance = 0
      velocity = 0
      lastX = e.clientX
      lastY = e.clientY
      lastTime = e.timeStamp
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = "grabbing"
      setHovered(null)
    }

    const onDragMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      const dt = Math.max(e.timeStamp - lastTime, 1)
      lastX = e.clientX
      lastY = e.clientY
      lastTime = e.timeStamp
      dragDistance += Math.abs(dx) + Math.abs(dy)
      velocity = velocity * 0.6 + (dx / dt) * 0.4

      spinTarget.y += dx * DRAG_SPEED
      spinTarget.x = THREE.MathUtils.clamp(
        spinTarget.x + dy * DRAG_SPEED * 0.75,
        -MAX_PITCH,
        MAX_PITCH
      )
      setSpin()
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
      canvas.style.cursor = "grab"
      // Momentum: carry the release velocity a little further.
      if (!reduceMotion && e.type === "pointerup") {
        spinTarget.y += velocity * 160 * DRAG_SPEED
        setSpin()
      }
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onDragMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)

    const onPointerMove = (e: PointerEvent) => {
      tiltY((e.clientX / window.innerWidth) * 2 - 1)
      tiltX((e.clientY / window.innerHeight) * 2 - 1)

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    const onPointerLeave = () => pointer.set(10, 10)

    // Click: a light sweep through the stack.
    const onClick = () => {
      // A drag ends with a click event too; only treat real clicks as clicks.
      if (!hovered || dragDistance > 5) return
      const origin = hovered.basePos
      boxes.forEach((box) => {
        const delay = box.basePos.distanceTo(origin) * 0.05
        gsap.fromTo(
          box.state,
          { glow: box === hovered ? 1.8 : 1.2 },
          {
            glow: box === hovered ? 1 : 0,
            duration: 1.1,
            delay,
            ease: "power2.out",
          }
        )
      })
    }

    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove)
      renderer.domElement.addEventListener("pointerleave", onPointerLeave)
      renderer.domElement.addEventListener("click", onClick)
    }

    const baseRot = cluster.rotation.clone()
    const tmpPos = new THREE.Vector3()

    const tick = (time: number) => {
      raycaster.setFromCamera(pointer, camera)
      const hit = dragging
        ? undefined
        : raycaster.intersectObjects(shells, false)[0]
      setHovered(
        hit ? (boxes.find((b) => b.shell === hit.object) ?? null) : null
      )

      applySpin()
      cluster.rotation.x = baseRot.x + tilt.x * 0.18
      cluster.rotation.y = baseRot.y + tilt.y * 0.3
      cluster.rotation.z = baseRot.z + Math.sin(time * 0.3) * 0.02
      cluster.position.y = Math.sin(time * 0.6) * 0.25

      boxes.forEach((box) => {
        const { group, basePos, speed, phase, outward, state } = box

        tmpPos.set(
          basePos.x,
          basePos.y + Math.sin(time * speed + phase) * 0.12,
          basePos.z
        )
        tmpPos.addScaledVector(outward, state.pop * 0.7)
        group.position.copy(tmpPos)

        box.inner.emissiveIntensity = INNER_GLOW + state.glow * 0.9
        box.rim.uniforms.uIntensity.value = RIM_GLOW + state.glow * 1.2
      })

      particles.rotation.y = time * 0.03
      particles.rotation.x = Math.sin(time * 0.02) * 0.04

      render()
    }

    // Drive the loop from GSAP's ticker; pause when offscreen.
    const onTick = (time: number) => tick(time)
    let running = false
    const start = () => {
      if (running || reduceMotion) return
      running = true
      gsap.ticker.add(onTick)
    }
    const stop = () => {
      if (!running) return
      running = false
      gsap.ticker.remove(onTick)
    }

    const visibility = new IntersectionObserver(([entry]) =>
      entry.isIntersecting ? start() : stop()
    )
    visibility.observe(container)

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w > 0 && h > 0) {
        camera.aspect = w / h
        fitCamera(camera.aspect)
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
        if (!running) render()
      }
    })
    resizeObserver.observe(container)

    if (reduceMotion) tick(0)

    return () => {
      stop()
      boxes.forEach((b) => gsap.killTweensOf(b.state))
      gsap.killTweensOf([tilt, spin])
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onDragMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      window.removeEventListener("pointermove", onPointerMove)
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave)
      renderer.domElement.removeEventListener("click", onClick)
      visibility.disconnect()
      resizeObserver.disconnect()
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      normalMap.dispose()
      glowMap.dispose()
      particleTexture.dispose()
      envTexture.dispose()
      studio.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div aria-hidden="true" className={cn("relative h-full w-full", className)}>
      {/* Oversized canvas host: boxes can drift past the layout box unclipped. */}
      <div
        ref={containerRef}
        className="absolute"
        style={{
          width: `${OVERSCAN * 100}%`,
          height: `${OVERSCAN * 100}%`,
          left: `${((1 - OVERSCAN) / 2) * 100}%`,
          top: `${((1 - OVERSCAN) / 2) * 100}%`,
        }}
      />
    </div>
  )
}
