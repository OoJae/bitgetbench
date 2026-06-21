"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// A liquid-chrome mark: a noise-deformed icosahedron with a procedural chrome matcap that
// rotates on its own and reacts to scroll velocity and the cursor. Ported from the brand
// system's chrome-object.js. Renders nothing extra if WebGL is unavailable.

function makeMatcap(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const lin = g.createLinearGradient(0, 0, 0, s);
  lin.addColorStop(0.0, "#ffffff");
  lin.addColorStop(0.3, "#9a9a9a");
  lin.addColorStop(0.47, "#fbfbfb");
  lin.addColorStop(0.505, "#3c3c3c");
  lin.addColorStop(0.66, "#121212");
  lin.addColorStop(1.0, "#000000");
  g.fillStyle = lin;
  g.fillRect(0, 0, s, s);
  const r1 = g.createRadialGradient(s * 0.34, s * 0.29, 0, s * 0.34, s * 0.29, s * 0.52);
  r1.addColorStop(0, "rgba(255,255,255,0.95)");
  r1.addColorStop(0.4, "rgba(255,255,255,0.16)");
  r1.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r1;
  g.fillRect(0, 0, s, s);
  const r2 = g.createRadialGradient(s * 0.73, s * 0.79, 0, s * 0.73, s * 0.79, s * 0.46);
  r2.addColorStop(0, "rgba(255,255,255,0.5)");
  r2.addColorStop(0.5, "rgba(255,255,255,0.05)");
  r2.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r2;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function noise3(x: number, y: number, z: number, t: number): number {
  return (
    Math.sin(x * 1.5 + t) * 0.5 +
    Math.sin(y * 1.8 - t * 1.1) * 0.4 +
    Math.sin(z * 1.6 + t * 0.7) * 0.4 +
    Math.sin((x + y) * 1.1 + t * 0.5) * 0.3 +
    Math.sin((y + z) * 1.3 - t * 0.6) * 0.3
  );
}

export function ChromeBlob() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;

    let dead = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL; the static fallback stays
    }
    const w = el.clientWidth || 600;
    const h = el.clientHeight || 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    cam.position.z = 5;

    const mat = new THREE.MeshMatcapMaterial({ matcap: makeMatcap() });
    const geo = new THREE.IcosahedronGeometry(1.4, 4);
    const base = (geo.attributes.position.array as Float32Array).slice(0);
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    let t = 0;
    let scroll = 0;
    let tx = 0;
    let ty = 0;
    let px = 0;
    let py = 0;

    const onScroll = () => {
      scroll = window.scrollY || window.pageYOffset || 0;
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });

    const ro = new ResizeObserver(() => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H);
      cam.aspect = W / H;
      cam.updateProjectionMatrix();
    });
    ro.observe(el);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const frame = () => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      t += 0.01;
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      const sc = scroll * 0.0012;
      const arr = pos.array as Float32Array;
      const amp = 0.2;
      for (let i = 0; i < pos.count; i++) {
        const ix = i * 3;
        const x = base[ix]!;
        const y = base[ix + 1]!;
        const z = base[ix + 2]!;
        const k = 1 + (noise3(x, y, z, t) * amp) / 1.7;
        arr[ix] = x * k;
        arr[ix + 1] = y * k;
        arr[ix + 2] = z * k;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      mesh.rotation.y = t * 0.22 + sc * 1.2 + px * 0.6;
      mesh.rotation.x = py * 0.5 + Math.sin(t * 0.3) * 0.1;
      renderer.render(scene, cam);
    };
    frame();

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mount}
      className="h-full w-full"
      style={{
        // Soft chrome glow behind the mark; also the static fallback if WebGL is missing.
        // Ends at near-void so the corners blend into the page.
        background:
          "radial-gradient(circle at 42% 36%, rgba(251,251,251,.9) 0%, rgba(154,154,154,.6) 26%, rgba(18,18,18,.4) 60%, rgba(10,10,10,0) 80%)",
      }}
    />
  );
}
