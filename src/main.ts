import * as THREE from 'three';
import QRCode from 'qrcode';
import './style.css';
import './diagnostics.css';
import type { DriveInput, SessionNotice } from './network/protocol';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main class="layout"><header><strong>くるくるドライブ！</strong><span id="link-state">コントローラーを待っています</span></header><section class="stage"><canvas id="game"></canvas><div class="hud"><div class="medals">⭐ <span id="medal-count">0</span> / 10</div><div class="progress"><i id="progress"></i></div></div><div class="finish hidden" id="finish"><b>ゴール！</b><span>メダルを <em id="final-count">0</em> まい あつめたよ</span><button id="again">もういっかい！</button></div><aside class="host-debug hidden" id="host-debug"><b>入力診断</b><span>操舵 <i id="host-steering">0.00</i></span><span>受信後 <i id="host-age">—</i></span><span>ブレーキ <i id="host-brake">OFF</i> ・ クラクション <i id="host-horn">OFF</i></span></aside></section><aside class="connect"><div><h1>スマホをハンドルにしよう</h1><p>QRコードを iPhone で読み取って接続</p><canvas id="qr" width="196" height="196"></canvas><small id="qr-help">起動時に接続用QRコードを準備します</small><button id="sound-toggle" class="sound-toggle">サウンドを有効にする</button></div></aside></main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setClearColor('#8ad8ff');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bcecff', 45, 150);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
camera.position.set(0, 8, 13);
scene.add(new THREE.HemisphereLight(0xffffff, 0x608542, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-5, 15, 8); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 220), new THREE.MeshStandardMaterial({ color: 0x72c95e }));
ground.rotation.x = -Math.PI / 2; ground.position.z = -70; scene.add(ground);

const road = new THREE.Group(); scene.add(road);
for (let i = 0; i < 11; i++) {
  const z = 10 - i * 13;
  const bend = Math.sin(i * 0.62) * 5;
  const segment = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x777e86, roughness: 0.95 }));
  segment.position.set(bend, 0.02, z); segment.rotation.y = -Math.cos(i * 0.62) * 0.19; road.add(segment);
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 5), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  line.position.set(bend, 0.1, z); line.rotation.y = segment.rotation.y; road.add(line);
  for (const side of [-1, 1]) {
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), new THREE.MeshStandardMaterial({ color: side < 0 ? 0xffd64d : 0xff8db1 }));
    flower.position.set(bend + side * (6 + Math.random() * 3), 0.35, z + Math.random() * 8); scene.add(flower);
    if (i % 2 === 0) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 1.6, 7), new THREE.MeshStandardMaterial({ color: 0x865338 }));
      trunk.position.set(bend + side * (9 + Math.random() * 4), 0.8, z); scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.25, 9, 7), new THREE.MeshStandardMaterial({ color: 0x42a84c }));
      crown.position.set(trunk.position.x, 2.15, z); scene.add(crown);
    }
  }
}

const car = new THREE.Group(); scene.add(car); car.position.set(0, 0, 5);
const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.8), new THREE.MeshStandardMaterial({ color: 0xf34743, roughness: 0.45 })); body.position.y = 0.72; car.add(body);
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.7, 1.3), new THREE.MeshStandardMaterial({ color: 0xb9edff, roughness: 0.25, metalness: 0.05 })); cabin.position.set(0, 1.32, -0.15); car.add(cabin);
const wheels: THREE.Mesh[] = [];
for (const x of [-0.95, 0.95]) for (const z of [-0.85, 0.9]) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0x33363d }));
  wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); car.add(wheel); wheels.push(wheel);
}

const medals = Array.from({ length: 10 }, (_, i) => {
  const medal = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24), new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.5, roughness: 0.28, emissive: 0x6e3d00, emissiveIntensity: 0.15 }));
  coin.rotation.x = Math.PI / 2; medal.add(coin);
  const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 0), new THREE.MeshStandardMaterial({ color: 0xfff3ad, emissive: 0xffbf14, emissiveIntensity: 0.3 })); medal.add(star);
  medal.position.set([0, -2.4, 2.6, -2.6, 2.6, -2.6, 2.4, -1.8, 1.5, 0][i]!, 1.5, -7 - i * 10.5); scene.add(medal); return medal;
});
const takenMedals = new Set<number>();

const gate = new THREE.Group(); scene.add(gate); gate.position.set(0, 0, -114);
for (let i = 0; i < 13; i++) {
  const angle = Math.PI * (i / 12);
  const piece = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.55), new THREE.MeshStandardMaterial({ color: [0xf14e54, 0xffa343, 0xffdf51, 0x50c878, 0x51a8f4, 0x9664dc][Math.floor(i / 2.2)] }));
  piece.position.set(Math.cos(angle) * 4, 3.2 + Math.sin(angle) * 3.2, 0); gate.add(piece);
}
const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0xffe55b })); sign.position.set(0, 2.9, 0); gate.add(sign);

const state = { steering: 0, brake: false, connected: false, started: false, complete: false, medals: 0, distance: 0, x: 0, seq: -1 };
const statusNode = document.querySelector('#link-state')!;
let socket: WebSocket | undefined;
let sessionToken = '';
let countdownTimer = 0;
let starting = false;
let audioContext: AudioContext | undefined;
let hornWasPressed = false;
let inputReceivedAt: number | undefined;
const debugEnabled = new URLSearchParams(location.search).get('debug') === '1';
if (debugEnabled) document.querySelector('#host-debug')!.classList.remove('hidden');

document.querySelector<HTMLButtonElement>('#sound-toggle')!.addEventListener('click', async event => {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  (event.currentTarget as HTMLButtonElement).textContent = 'サウンド ON';
});

function playHorn() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  for (const frequency of [360, 440]) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.065, now + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + 0.25);
  }
}

function queueStart() {
  window.clearInterval(countdownTimer);
  state.started = false;
  starting = true;
  state.brake = true;
  let seconds = 3;
  statusNode.textContent = `スタートまで ${seconds}`;
  countdownTimer = window.setInterval(() => {
    if (!state.connected) { window.clearInterval(countdownTimer); starting = false; return; }
    seconds--;
    if (seconds > 0) statusNode.textContent = `スタートまで ${seconds}`;
    else { window.clearInterval(countdownTimer); starting = false; state.brake = false; state.started = true; statusNode.textContent = 'いってみよう！'; }
  }, 1000);
}

async function connect() {
  const response = await fetch('/api/sessions', { method: 'POST' });
  if (!response.ok) throw new Error(`Session request failed: ${response.status}`);
  const { token } = await response.json() as { token: string };
  sessionToken = token;
  const defaultControllerOrigin = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:5174` : location.origin;
  const controllerOrigin = import.meta.env.VITE_CONTROLLER_ORIGIN || defaultControllerOrigin;
  const usesSeparateControllerOrigin = Boolean(import.meta.env.VITE_CONTROLLER_ORIGIN) || import.meta.env.DEV;
  const controllerPath = usesSeparateControllerOrigin ? '/' : '/controller/';
  const controllerUrl = new URL(controllerPath, controllerOrigin);
  controllerUrl.searchParams.set('host', location.host);
  controllerUrl.searchParams.set('token', token);
  await QRCode.toCanvas(document.querySelector<HTMLCanvasElement>('#qr')!, controllerUrl.toString(), { width: 196, margin: 1, color: { dark: '#21323b', light: '#ffffff' } });
  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${wsProtocol}//${location.host}/ws?role=host&token=${encodeURIComponent(token)}`);
  socket.addEventListener('open', () => { statusNode.textContent = 'QRコードを読み取って接続'; });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as DriveInput | SessionNotice;
    if (message.type === 'status') {
      state.connected = message.connected;
      statusNode.textContent = message.connected ? 'スマホ接続中！' : 'コントローラーを待っています';
      if (!message.connected) { state.steering = 0; state.brake = true; state.started = false; hornWasPressed = false; }
      else queueStart();
      return;
    }
    if (message.type === 'input' && message.seq > state.seq) {
      state.seq = message.seq; state.steering = message.steering; state.brake = message.brake;
      inputReceivedAt = message.receivedAt;
      if (message.horn && !hornWasPressed) playHorn();
      hornWasPressed = message.horn;
    }
  });
  socket.addEventListener('close', () => { state.connected = false; state.steering = 0; state.brake = true; state.started = false; statusNode.textContent = '通信が切れました'; });
  document.querySelector('#qr-help')!.textContent = `iPhone用 URL: ${controllerUrl.origin}`;
  void sessionToken;
}
void connect().catch(error => { statusNode.textContent = '接続準備に失敗しました'; console.error(error); });

document.querySelector<HTMLButtonElement>('#again')!.addEventListener('click', () => {
  state.complete = false; state.started = state.connected; state.distance = 0; state.medals = 0; state.x = 0;
  takenMedals.clear();
  for (const medal of medals) medal.visible = true;
  document.querySelector('#finish')!.classList.add('hidden');
  document.querySelector('#medal-count')!.textContent = '0';
});

const clock = new THREE.Clock();
function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.started && !state.complete) {
    const speed = state.brake ? 0.8 : 3;
    state.distance += speed * dt;
    car.position.z = 5 - state.distance;
    state.x += state.steering * 3.2 * dt;
    state.x = THREE.MathUtils.clamp(state.x, -3.2, 3.2);
    car.position.x = THREE.MathUtils.lerp(car.position.x, state.x, 0.12);
    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -state.steering * 0.13, 0.1);
    wheels.forEach(wheel => { wheel.rotation.x += speed * dt; });
    for (const [index, medal] of medals.entries()) {
      medal.rotation.y += dt * 1.5; medal.position.y = 1.5 + Math.sin(clock.elapsedTime * 2 + medal.position.z) * 0.16;
      if (!takenMedals.has(index) && medal.position.distanceTo(car.position.clone().setY(1.1)) < 1.25) {
        takenMedals.add(index); medal.visible = false; state.medals++;
        document.querySelector('#medal-count')!.textContent = String(state.medals);
      }
    }
    const progress = Math.min(state.distance / 120, 1);
    document.querySelector<HTMLElement>('#progress')!.style.width = `${progress * 100}%`;
    if (progress >= 1) {
      state.complete = true; state.started = false;
      document.querySelector('#final-count')!.textContent = String(state.medals);
      document.querySelector('#finish')!.classList.remove('hidden');
    }
  }
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, car.position.x * 0.35, 0.04);
  camera.position.z = car.position.z + 13;
  camera.lookAt(car.position.x * 0.3, 1.1, car.position.z - 12);
  renderer.render(scene, camera);
}
tick();
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); statusNode.textContent = '画面を復旧しています…'; });
canvas.addEventListener('webglcontextrestored', () => { statusNode.textContent = state.connected ? 'スマホ接続中！' : 'コントローラーを待っています'; });
window.setInterval(() => {
  if (!debugEnabled) return;
  document.querySelector('#host-steering')!.textContent = state.steering.toFixed(2);
  document.querySelector('#host-age')!.textContent = inputReceivedAt === undefined ? '—' : `${Math.max(0, Date.now() - inputReceivedAt)} ms`;
  document.querySelector('#host-brake')!.textContent = state.brake ? 'ON' : 'OFF';
  document.querySelector('#host-horn')!.textContent = hornWasPressed ? 'ON' : 'OFF';
}, 100);

window.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();
  if (event.key === 'ArrowLeft') state.steering = -1;
  if (event.key === 'ArrowRight') state.steering = 1;
  if (event.key === ' ') state.brake = true;
  if (!state.started && !starting && !state.complete) { state.connected = true; queueStart(); }
});
window.addEventListener('keyup', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') state.steering = 0;
  if (event.key === ' ') state.brake = false;
});
