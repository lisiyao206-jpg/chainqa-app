<!-- StarBg.vue：丝絮星云背景 -->
<!-- 拖尾的做法：每一帧不擦掉画布，只盖一层几乎透明的黑色，上一帧的粒子留下残影，连起来就是丝絮 -->
<template>
  <canvas ref="canvasRef" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
const canvasRef = ref(null);
let ctx, w, h;
let particles = [];
let animId = null;
const mode = ref("bloom"); // bloom 向外旋转喷发 / blackhole 向内旋转吸入

// 粒子类
class Particle {
  constructor(cx, cy) {
    // 从中心附近一个小圆里出生
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 8;
    this.x = cx + Math.cos(a) * r;
    this.y = cy + Math.sin(a) * r;
    // 速度：往外飞（径向）。速度有快有慢，飞得快的能铺到屏幕边缘
    const speed = 0.6 + Math.random() * 3.2;
    this.vx = Math.cos(a) * speed;
    this.vy = Math.sin(a) * speed;
    this.life = 1;
    this.decay = 0.002 + Math.random() * 0.003;
    this.size = 0.8 + Math.random() * 1.8;
    // HSL 色彩：青、蓝、紫、玫红
    this.hue = 180 + Math.random() * 140; // 180 青 ~ 320 玫红
    this.hueSpeed = (Math.random() - 0.5) * 0.3;
  }

  update(cx, cy, isAttract) {
    const dx = this.x - cx;
    const dy = this.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // 旋转：给粒子一个「绕中心转」的力（垂直于半径方向），越靠近中心转得越猛
    const swirl = 0.05 * Math.min(1, 120 / dist);
    this.vx += (-dy / dist) * swirl;
    this.vy += (dx / dist) * swirl;
    if (isAttract) {
      // 黑洞引力：拉回中心
      this.vx -= (dx / dist) * 0.06;
      this.vy -= (dy / dist) * 0.06;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
    this.hue += this.hueSpeed;
    // 阻力，让粒子慢慢减速，形成丝缕拖尾
    this.vx *= 0.993;
    this.vy *= 0.993;
  }

  draw(ctx) {
    const a = this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${this.hue}, 80%, 62%, ${a * 0.6})`;
    ctx.fill();
    // 绘制拖尾（丝絮效果）
    if (a > 0.2) {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 4, this.y - this.vy * 4);
      ctx.strokeStyle = `hsla(${this.hue}, 80%, 62%, ${a * 0.3})`;
      ctx.lineWidth = this.size * 0.6;
      ctx.stroke();
    }
  }
}

// 初始化粒子，从画面中心生成（花朵爆发中心点）
function createParticles(count) {
  particles = [];
  for (let i = 0; i < count; i++) {
    const p = new Particle(w / 2, h / 2);
    // 一开始让粒子处在各自生命的不同阶段，打开页面就是满屏，不用等它慢慢长出来
    const steps = Math.floor(Math.random() * 300);
    for (let s = 0; s < steps && p.life > 0; s++) p.update(w / 2, h / 2, mode.value === "blackhole");
    particles.push(p);
  }
}

function animate() {
  // 半透明黑色覆盖，制造拖尾残留：不清除整张画布，丝絮感的关键
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(0, 0, w, h);
  // 叠加模式：光与光重叠更亮，中心自然发光
  ctx.globalCompositeOperation = "lighter";
  const isAttract = mode.value === "blackhole";
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.update(w / 2, h / 2, isAttract);
    p.draw(ctx);
    // 寿命用完、或飞出屏幕：回到中心重新出生，保持星云源源不断
    if (p.life <= 0 || p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
      particles[i] = new Particle(w / 2, h / 2);
    }
  }
  animId = requestAnimationFrame(animate);
}

function resize() {
  // 高清屏按实际像素画，不会糊
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth;
  h = window.innerHeight;
  canvasRef.value.width = w * dpr;
  canvasRef.value.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  // 屏幕越大粒子越多，铺满画面
  createParticles(Math.min(2500, Math.floor((w * h) / 900)));
}

onMounted(() => {
  ctx = canvasRef.value.getContext("2d");
  resize();
  animate();
  window.addEventListener("resize", resize);
});

onUnmounted(() => {
  cancelAnimationFrame(animId);
  window.removeEventListener("resize", resize);
});
</script>
