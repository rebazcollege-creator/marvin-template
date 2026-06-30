/* ============================================================
   Hero — interactive portrait relief (Three.js)
   Vertex displacement from image luminance + cursor parallax;
   fragment adds sculpted light, chromatic split, grain, vignette.
   Falls back to a static duotone image if WebGL is unavailable.
   ============================================================ */
import * as THREE from "three";

const wrap = document.querySelector(".hero__visual");
const canvas = document.getElementById("relief");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (wrap && canvas) boot();

function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) { return; } // keep CSS fallback
  if (!renderer.capabilities.isWebGL2 && !renderer.getContext()) return;

  const W = () => wrap.clientWidth, H = () => wrap.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W(), H());

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, W() / H(), 0.1, 100);
  const fovR = (35 * Math.PI) / 180;
  cam.position.z = 1 / Math.tan(fovR / 2);

  const group = new THREE.Group();
  scene.add(group);

  const uniforms = {
    uTex: { value: null },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uPlaneAspect: { value: W() / H() },
    uImgAspect: { value: 1 },
    uAmp: { value: reduce ? 0.0 : 0.16 },
    uScroll: { value: 0 },
  };

  const vert = `
    uniform sampler2D uTex; uniform float uTime,uAmp,uPlaneAspect,uImgAspect; uniform vec2 uMouse;
    varying vec2 vUv; varying float vDepth;
    vec2 cover(vec2 uv){
      vec2 p=uv-0.5;
      if(uImgAspect>uPlaneAspect) p.x*=uPlaneAspect/uImgAspect; else p.y*=uImgAspect/uPlaneAspect;
      return p+0.5;
    }
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    void main(){
      vUv=cover(uv);
      float d=lum(texture2D(uTex,vUv).rgb);
      vDepth=d;
      vec3 pos=position;
      float wave=sin(vUv.x*6.0+uTime)*0.012 + cos(vUv.y*5.0-uTime*0.8)*0.010;
      pos.z += (d-0.45)*uAmp + wave;
      // cursor parallax push
      pos.x += uMouse.x*0.06*(d+0.3);
      pos.y += uMouse.y*0.06*(d+0.3);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
    }`;

  const frag = `
    precision highp float;
    uniform sampler2D uTex; uniform float uTime,uImgAspect,uPlaneAspect; uniform vec2 uMouse;
    varying vec2 vUv; varying float vDepth;
    float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      if(vUv.x<0.0||vUv.x>1.0||vUv.y<0.0||vUv.y>1.0){discard;}
      vec2 px=vec2(1.0/900.0);
      // sculpted light from luminance gradient
      float lx=lum(texture2D(uTex,vUv+vec2(px.x,0.)).rgb)-lum(texture2D(uTex,vUv-vec2(px.x,0.)).rgb);
      float ly=lum(texture2D(uTex,vUv+vec2(0.,px.y)).rgb)-lum(texture2D(uTex,vUv-vec2(0.,px.y)).rgb);
      vec3 n=normalize(vec3(-lx*3.0,-ly*3.0,1.0));
      vec3 ldir=normalize(vec3(0.4+uMouse.x*0.5,0.5+uMouse.y*0.4,0.9));
      float light=clamp(dot(n,ldir),0.0,1.0);
      // chromatic split scaled by mouse + depth
      float s=(0.002+length(uMouse)*0.004)*(vDepth+0.2);
      vec3 col;
      col.r=texture2D(uTex,vUv+vec2(s,0.)).r;
      col.g=texture2D(uTex,vUv).g;
      col.b=texture2D(uTex,vUv-vec2(s,0.)).b;
      // warm grade toward ink/gold
      col=mix(col, col*vec3(1.08,0.96,0.78), 0.18);
      col*=0.82+light*0.5;
      // grain
      float g=hash(vUv*vec2(900.0,1200.0)+uTime);
      col+=(g-0.5)*0.06;
      // vignette
      float v=smoothstep(1.15,0.35,length((vUv-0.5)*vec2(1.0,1.1)));
      col*=0.55+0.45*v;
      gl_FragColor=vec4(col,1.0);
    }`;

  const geo = new THREE.PlaneGeometry(2 * (W() / H()), 2, 240, 240);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // load portrait texture
  new THREE.TextureLoader().load(
    "assets/img/hero-color.webp",
    function (tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      uniforms.uTex.value = tex;
      uniforms.uImgAspect.value = tex.image.width / tex.image.height;
      wrap.classList.add("gl-on");
    },
    undefined,
    function () { /* keep fallback */ }
  );

  // pointer
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  wrap.addEventListener("pointermove", function (e) {
    const r = wrap.getBoundingClientRect();
    tmx = ((e.clientX - r.left) / r.width) * 2 - 1;
    tmy = -(((e.clientY - r.top) / r.height) * 2 - 1);
  });
  wrap.addEventListener("pointerleave", function () { tmx = 0; tmy = 0; });

  // scroll fade/tilt
  let scrollN = 0;
  addEventListener("scroll", function () {
    const r = wrap.getBoundingClientRect();
    scrollN = Math.min(1, Math.max(0, -r.top / (innerHeight * 0.9)));
  }, { passive: true });

  function resize() {
    renderer.setSize(W(), H());
    cam.aspect = W() / H(); cam.updateProjectionMatrix();
    uniforms.uPlaneAspect.value = W() / H();
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(2 * (W() / H()), 2, 240, 240);
  }
  addEventListener("resize", resize);

  const clock = new THREE.Clock();
  (function render() {
    const t = clock.getElapsedTime();
    mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    uniforms.uTime.value = t;
    uniforms.uMouse.value.set(mx, my);
    group.rotation.y = mx * 0.18;
    group.rotation.x = my * 0.14 + scrollN * 0.12;
    group.position.y = scrollN * 0.5;
    mesh.material.opacity = 1 - scrollN;
    cam.position.x = mx * 0.12;
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
    requestAnimationFrame(render);
  })();
}
