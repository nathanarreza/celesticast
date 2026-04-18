/* stars.js — Canvas star field for CelastiCast */
(function () {
  const canvas = document.getElementById('star-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, stars, shootingStars;

  const STAR_COUNT = 200;
  const SHOOT_INTERVAL_MIN = 3000;
  const SHOOT_INTERVAL_MAX = 7000;

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function initStars() {
    stars = Array.from({ length: STAR_COUNT }, () => ({
      x: rand(0, W),
      y: rand(0, H),
      r: rand(0.3, 1.6),
      alpha: rand(0.2, 0.9),
      twinkleSpeed: rand(0.005, 0.018),
      twinkleDir: Math.random() > 0.5 ? 1 : -1,
    }));
    shootingStars = [];
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initStars();
  }

  function spawnShootingStar() {
    shootingStars.push({
      x: rand(W * 0.1, W * 0.9),
      y: rand(0, H * 0.4),
      len: rand(80, 160),
      angle: rand(25, 50) * Math.PI / 180,
      speed: rand(6, 12),
      alpha: 1,
      fade: rand(0.02, 0.04),
    });
    setTimeout(spawnShootingStar, rand(SHOOT_INTERVAL_MIN, SHOOT_INTERVAL_MAX));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Stars
    for (const s of stars) {
      s.alpha += s.twinkleSpeed * s.twinkleDir;
      if (s.alpha >= 0.9) s.twinkleDir = -1;
      if (s.alpha <= 0.15) s.twinkleDir = 1;

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210, 220, 255, ${s.alpha})`;
      ctx.fill();
    }

    // Occasional star clusters / small nebula hints
    // (drawn as faint blobs)
    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.fillStyle = '#5548e4';
    ctx.beginPath();
    ctx.ellipse(W * 0.75, H * 0.3, 180, 90, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.02;
    ctx.fillStyle = '#3a8cff';
    ctx.beginPath();
    ctx.ellipse(W * 0.2, H * 0.65, 120, 60, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shooting stars
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const ss = shootingStars[i];
      ss.x += Math.cos(ss.angle) * ss.speed;
      ss.y += Math.sin(ss.angle) * ss.speed;
      ss.alpha -= ss.fade;

      if (ss.alpha <= 0) { shootingStars.splice(i, 1); continue; }

      const tailX = ss.x - Math.cos(ss.angle) * ss.len;
      const tailY = ss.y - Math.sin(ss.angle) * ss.len;
      const grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
      grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
      grad.addColorStop(1, `rgba(220, 230, 255, ${ss.alpha})`);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(ss.x, ss.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  setTimeout(spawnShootingStar, rand(1500, 3000));
  draw();
})();
