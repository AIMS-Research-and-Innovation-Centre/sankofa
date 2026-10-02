import { useContext, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { archiveConnected, errorMessage, graphUrl, type GraphData } from '../api';
import { Link, Navigation } from '../router';
import SearchForm from './SearchForm';

const empty: GraphData = { nodes: [], edges: [] };
export default function Graph({ search }: { search: string }) {
  const [data, setData] = useState<GraphData>(empty); const [status, setStatus] = useState('Connecting to the graph…');
  const [filter, setFilter] = useState(''); const [query, setQuery] = useState(''); const [renderError, setRenderError] = useState('');
  const container = useRef<HTMLDivElement>(null); const navigate = useContext(Navigation);
  const focus = new URLSearchParams(search).get('focus');
  useEffect(() => { const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFilter(''); setQuery(''); } }; window.addEventListener('keydown', clear); return () => window.removeEventListener('keydown', clear); }, []);
  useEffect(() => {
    if (!archiveConnected) { setStatus('The archive service is not connected.'); return; }
    let disposed = false; let socket: WebSocket; let retry: ReturnType<typeof setTimeout>;
    let attempt = 0;
    function connect() {
      if (disposed) return;
      socket = new WebSocket(graphUrl());
      socket.onopen = () => { attempt = 0; setStatus('Waiting for a graph snapshot…'); };
      socket.onmessage = event => {
        try {
          const snapshot = JSON.parse(event.data);
          if (snapshot.error) { setStatus('The graph service is unavailable. Waiting for recovery…'); return; }
          if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) throw new Error('Invalid graph snapshot');
          setData(previous => JSON.stringify(previous) === JSON.stringify(snapshot) ? previous : snapshot);
          setStatus(`${snapshot.nodes.length} theses · ${snapshot.edges.length} concept connections`);
        } catch { setStatus('The graph returned an unreadable snapshot. Waiting for recovery…'); }
      };
      socket.onerror = () => setStatus('Connection interrupted. Reconnecting…');
      socket.onclose = () => { if (!disposed) { setStatus('Connection interrupted. Reconnecting…'); retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++)); } };
    }
    connect(); return () => { disposed = true; clearTimeout(retry); socket?.close(); };
  }, []);
  const visible = data.nodes.filter(n => !query || `${n.title} ${n.campus || ''} ${(n.concepts || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const host = container.current; if (!host) return;
    host.replaceChildren(); setRenderError('');
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined; let observer: ResizeObserver | undefined;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const canvas = renderer.domElement; canvas.setAttribute('aria-label', 'Thesis graph. Use the thesis list below for keyboard navigation.'); canvas.setAttribute('role', 'img'); host.append(canvas);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000); camera.position.set(0, 0, 170);
      controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.autoRotate = false; controls.minDistance = 25; controls.maxDistance = 280;
      const nodes = data.nodes;
      const positions = nodes.map((_, i) => { const y = 1 - (i + 0.5) / Math.max(1, nodes.length) * 2; const radius = Math.sqrt(1 - y * y); const angle = i * Math.PI * (3 - Math.sqrt(5)); return new THREE.Vector3(Math.cos(angle) * radius * 55, y * 55, Math.sin(angle) * radius * 55); });
      const index = new Map(nodes.map((n, i) => [n.id, i]));
      const matches = new Set(visible.map(n => n.id));
      const geometry = new THREE.BufferGeometry().setFromPoints(positions);
      const colors = new Float32Array(nodes.length * 3);
      nodes.forEach((n, i) => { const color = new THREE.Color(matches.has(n.id) ? '#58a6ff' : '#484f58'); color.toArray(colors, i * 3); });
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true })); scene.add(points);
      const edges: THREE.Vector3[] = [];
      data.edges.forEach(e => { const a = index.get(e.source), b = index.get(e.target); if (a !== undefined && b !== undefined) edges.push(positions[a], positions[b]); });
      scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), new THREE.LineBasicMaterial({ color: '#30363d' })));
      const labels = nodes.map((n, i) => { const label = document.createElement('span'); label.className = 'node-label'; label.textContent = n.title; host.append(label); return { label, position: positions[i], id: n.id }; });
      if (focus && index.has(focus)) { const position = positions[index.get(focus)!]; controls.target.copy(position); camera.position.copy(position).add(new THREE.Vector3(0, 0, 45)); }
      const render = () => {
        if (!renderer || !controls) return; renderer.render(scene, camera);
        labels.forEach(({ label, position, id }) => { const p = position.clone().project(camera); const shown = camera.position.distanceTo(controls!.target) < 100 && matches.has(id) && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1; label.hidden = !shown; if (shown) { label.style.left = `${(p.x + 1) / 2 * host.clientWidth}px`; label.style.top = `${(-p.y + 1) / 2 * host.clientHeight}px`; } });
      };
      controls.addEventListener('change', render);
      observer = new ResizeObserver(() => { if (!renderer) return; camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); render(); }); observer.observe(host);
      let down = { x: 0, y: 0 };
      canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
      canvas.addEventListener('click', e => {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
        const rect = canvas.getBoundingClientRect(); const pointer = new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
        const ray = new THREE.Raycaster(); ray.params.Points.threshold = 3; ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObject(points)[0]; if (hit?.index !== undefined) navigate(`/thesis/${encodeURIComponent(nodes[hit.index].id)}`);
      });
      controls.update(); render();
    } catch (e) { setRenderError(`The 3D view is unavailable in this browser. Use the thesis links below. ${errorMessage(e)}`); }
    return () => { observer?.disconnect(); controls?.dispose(); scene.traverse(object => { if (object instanceof THREE.Points || object instanceof THREE.LineSegments) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach(m => m.dispose()); else material.dispose(); } }); renderer?.dispose(); host.replaceChildren(); };
  }, [data, query, focus, navigate]);
  return <><div className="graph-heading"><div><h1>Graph</h1><p className="meta">Theses connected through shared concepts.</p></div><p className="mono meta" role="status">{status}</p></div><section className="graph-frame" aria-label="Graph view"><div ref={container} className="graph-canvas" /><div className="graph-search"><SearchForm value={filter} onChange={setFilter} onSubmit={() => setQuery(filter.trim())} label="Find a thesis or concept…" /></div><p className="graph-instructions">Drag to rotate · Scroll to zoom · Click a thesis to open</p></section>{renderError && <p role="alert" className="error">{renderError}</p>}<section className="graph-records"><h2>Theses in this view</h2><p className="meta">All graph records are also available as keyboard-accessible links.</p>{!visible.length && <p>No matching theses in the current snapshot.</p>}<ul>{visible.map(n => <li key={n.id}><Link href={`/thesis/${encodeURIComponent(n.id)}`}>{n.title}</Link><span className="meta">{n.campus} · {n.year || 'Year not recorded'}</span></li>)}</ul></section></>;
}
