import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import type { EditorEntity } from '../../services/cad/dxf'
import {
  buildCapPositions,
  buildWallPositions,
  entitySegments,
  planBounds,
} from '../../services/cad/extrude'

/**
 * 2D DXF 편집 엔티티를 높이 height 로 압출해 3D로 보여주는 뷰어 (three.js).
 * 무겁기 때문에 CadEditorPage 에서 React.lazy 로 필요할 때만 로드한다.
 * 마우스: 드래그=회전, 휠=줌, 우클릭 드래그=이동 (OrbitControls).
 */

interface ThreeViewerProps {
  entities: EditorEntity[]
  height: number
  hiddenLayers: Set<string>
  solid: boolean
}

export function ThreeViewer({ entities, height, hiddenLayers, solid }: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    mesh: THREE.Mesh | null
    grid: THREE.GridHelper | null
    raf: number
  } | null>(null)

  // 1) 씬 1회 초기화
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(1, 2, 1.5)
    scene.add(dir)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const st = { renderer, scene, camera, controls, mesh: null as THREE.Mesh | null, grid: null as THREE.GridHelper | null, raf: 0 }
    stateRef.current = st

    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      st.raf = requestAnimationFrame(animate)
    }
    st.raf = requestAnimationFrame(animate)

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(st.raf)
      ro.disconnect()
      controls.dispose()
      st.mesh?.geometry.dispose()
      ;(st.mesh?.material as THREE.Material | undefined)?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [])

  // 2) 데이터/높이 변경 시 메시 재생성 + 카메라 맞춤
  useEffect(() => {
    const st = stateRef.current
    if (!st) return

    // 기존 메시/그리드 제거
    if (st.mesh) {
      st.scene.remove(st.mesh)
      st.mesh.geometry.dispose()
      ;(st.mesh.material as THREE.Material).dispose()
      st.mesh = null
    }
    if (st.grid) {
      st.scene.remove(st.grid)
      st.grid.dispose()
      st.grid = null
    }

    const visible = entities.filter((e) => !hiddenLayers.has(e.layer))
    const segs = entitySegments(visible)
    const positions = buildWallPositions(segs, height)
    if (solid) {
      positions.push(...buildCapPositions(visible, height, { floor: true, ceiling: true }))
    }
    const bounds = planBounds(segs)

    if (positions.length > 0) {
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geom.computeVertexNormals()
      const mat = new THREE.MeshStandardMaterial({
        color: 0x93a3b8,
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geom, mat)
      st.scene.add(mesh)
      st.mesh = mesh
    }

    if (bounds) {
      const grid = new THREE.GridHelper(bounds.size * 2, 20, 0xcbd5e1, 0xe2e8f0)
      grid.position.set(bounds.cx, 0, bounds.cz)
      st.scene.add(grid)
      st.grid = grid

      const target = new THREE.Vector3(bounds.cx, height / 2, bounds.cz)
      st.controls.target.copy(target)
      const d = bounds.size * 1.6 + height
      st.camera.position.set(bounds.cx + d * 0.7, height + d * 0.7, bounds.cz + d * 0.7)
      st.camera.near = Math.max(0.1, d / 1000)
      st.camera.far = d * 20
      st.camera.updateProjectionMatrix()
      st.controls.update()
    }
  }, [entities, height, hiddenLayers, solid])

  return <div ref={mountRef} className="h-full w-full" />
}

export default ThreeViewer
