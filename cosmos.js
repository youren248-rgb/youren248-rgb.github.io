(function initGoodMoodCosmos(global) {
  'use strict';

  const TAU = Math.PI * 2;
  const SCENE_COUNT = 6;
  const QUALITY_SCALES = [0.55, 0.7, 0.85, 1];
  const STATIC_TIME = 1.35;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
  const now = () => (global.performance && performance.now ? performance.now() : Date.now());

  function notify(options, name, payload) {
    const callback = options && options[name];
    if (typeof callback !== 'function') return;
    try {
      callback(payload);
    } catch (_) {
      // A consumer callback must never stop the renderer.
    }
  }

  function mediaMatches(query) {
    try {
      return typeof global.matchMedia === 'function' && global.matchMedia(query).matches;
    } catch (_) {
      return false;
    }
  }

  function connectionSavesData() {
    const connection = global.navigator && (
      navigator.connection || navigator.mozConnection || navigator.webkitConnection
    );
    return Boolean(connection && connection.saveData);
  }

  const VERTEX_SOURCE = `#version 300 es
    precision highp float;
    out vec2 vUv;

    void main() {
      vec2 position = vec2(
        float((gl_VertexID << 1) & 2),
        float(gl_VertexID & 2)
      );
      vUv = position * 0.5;
      gl_Position = vec4(position - 1.0, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SOURCE = `#version 300 es
    precision highp float;

    in vec2 vUv;
    out vec4 outColor;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec4 uPointer;
    uniform float uScroll;
    uniform float uVelocity;
    uniform float uScene;
    uniform float uQuality;

    #define PI 3.14159265359
    #define TAU 6.28318530718

    float saturate(float value) {
      return clamp(value, 0.0, 1.0);
    }

    mat2 rotate2d(float angle) {
      float sine = sin(angle);
      float cosine = cos(angle);
      return mat2(cosine, -sine, sine, cosine);
    }

    float hash21(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    vec2 hash22(vec2 point) {
      float value = hash21(point);
      return vec2(value, hash21(point + value + 19.19));
    }

    float valueNoise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      float a = hash21(cell);
      float b = hash21(cell + vec2(1.0, 0.0));
      float c = hash21(cell + vec2(0.0, 1.0));
      float d = hash21(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
    }

    float fbm(vec2 point) {
      float sum = 0.0;
      float amplitude = 0.52;
      mat2 turn = rotate2d(0.57);
      for (int octave = 0; octave < 5; octave++) {
        if (float(octave) > mix(2.0, 4.0, uQuality)) break;
        sum += amplitude * valueNoise(point);
        point = turn * point * 2.03 + vec2(7.7, 3.1);
        amplitude *= 0.5;
      }
      return sum;
    }

    vec3 palettePrimary(float scene) {
      if (scene < 0.5) return vec3(1.0, 0.34, 0.055);
      if (scene < 1.5) return vec3(1.0, 0.62, 0.19);
      if (scene < 2.5) return vec3(0.13, 0.48, 1.0);
      if (scene < 3.5) return vec3(1.0, 0.42, 0.08);
      if (scene < 4.5) return vec3(0.82, 0.88, 1.0);
      return vec3(1.0, 0.55, 0.13);
    }

    vec3 paletteSecondary(float scene) {
      if (scene < 0.5) return vec3(0.13, 0.42, 0.92);
      if (scene < 1.5) return vec3(0.96, 0.88, 0.7);
      if (scene < 2.5) return vec3(0.96, 0.83, 0.6);
      if (scene < 3.5) return vec3(0.15, 0.43, 0.88);
      if (scene < 4.5) return vec3(1.0, 0.48, 0.08);
      return vec3(0.94, 0.9, 0.8);
    }

    vec4 sceneProfile(float scene) {
      if (scene < 0.5) return vec4(1.0, 0.48, 0.26, 0.62);
      if (scene < 1.5) return vec4(0.72, 0.95, 0.4, 0.78);
      if (scene < 2.5) return vec4(0.43, 0.72, 1.0, 0.66);
      if (scene < 3.5) return vec4(0.82, 1.0, 0.58, 0.52);
      if (scene < 4.5) return vec4(0.36, 0.64, 0.88, 0.9);
      return vec4(1.0, 0.92, 0.82, 0.52);
    }

    vec3 renderStars(
      vec2 point,
      float scale,
      float seed,
      float brightness,
      float warp,
      vec3 warm,
      vec3 cool
    ) {
      vec2 gridPoint = point * scale;
      vec2 cell = floor(gridPoint);
      vec2 local = fract(gridPoint) - 0.5;
      vec2 randomPoint = (hash22(cell + seed) - 0.5) * 0.72;
      vec2 delta = local - randomPoint;
      delta.y /= 1.0 + warp * (5.0 + scale * 0.08);

      float randomValue = hash21(cell + seed * 3.17);
      float density = mix(0.968, 0.915, uQuality);
      float visible = step(density, randomValue);
      float distanceToStar = length(delta);
      float core = exp(-distanceToStar * mix(95.0, 150.0, scale / 38.0));
      float rays = exp(-abs(delta.x) * 130.0) * exp(-abs(delta.y) * 22.0) * 0.24;
      float pulse = 0.9 + 0.1 * sin(uTime * 0.28 + randomValue * TAU);
      vec3 starColor = mix(cool, warm, hash21(cell + seed + 9.2));
      return starColor * (core + rays) * visible * brightness * pulse;
    }

    void main() {
      vec2 pixel = gl_FragCoord.xy;
      vec2 point = (pixel * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
      float sceneIndex = floor(clamp(uScene, 0.0, 5.0));
      float sceneBlend = smoothstep(0.0, 1.0, fract(clamp(uScene, 0.0, 5.0)));
      float nextScene = min(sceneIndex + 1.0, 5.0);

      vec3 primary = mix(
        palettePrimary(sceneIndex),
        palettePrimary(nextScene),
        sceneBlend
      );
      vec3 secondary = mix(
        paletteSecondary(sceneIndex),
        paletteSecondary(nextScene),
        sceneBlend
      );
      vec4 profile = mix(
        sceneProfile(sceneIndex),
        sceneProfile(nextScene),
        sceneBlend
      );

      float scenePhase = (sceneIndex + sceneBlend) / 5.0;
      float velocity = clamp(abs(uVelocity), 0.0, 1.0);
      vec2 pointer = uPointer.xy * vec2(
        uResolution.x / min(uResolution.x, uResolution.y),
        uResolution.y / min(uResolution.x, uResolution.y)
      );
      pointer *= uPointer.z;

      vec2 lensCenter = vec2(
        mix(0.48, -0.2, scenePhase),
        0.08 + sin(scenePhase * TAU) * 0.16
      );
      lensCenter += pointer * 0.075;
      vec2 lensVector = point - lensCenter;
      float lensRadius = length(lensVector);
      float lensForce = profile.y * 0.035 / (0.08 + lensRadius * lensRadius);
      vec2 bentPoint = point + normalize(lensVector + 0.0001) * lensForce;

      float slowTime = uTime * 0.045;
      vec2 flowPoint = rotate2d(-0.16 + scenePhase * 0.36) * bentPoint;
      flowPoint.y += uScroll * 0.34;
      flowPoint.x += sin(flowPoint.y * 1.4 + slowTime) * 0.025;

      vec3 color = vec3(0.0015, 0.0035, 0.0085);
      color += vec3(0.004, 0.007, 0.014) * (1.0 - length(point) * 0.18);

      float cloudA = fbm(flowPoint * 1.22 + vec2(slowTime, -slowTime * 0.42));
      float cloudB = fbm(flowPoint * 2.38 - vec2(slowTime * 0.58, slowTime * 0.31));
      float dust = smoothstep(0.39, 0.86, cloudA * 0.74 + cloudB * 0.38);
      float dustVeil = smoothstep(0.18, 0.9, cloudA) * profile.w;
      color += mix(secondary, primary, cloudB) * dust * 0.105 * profile.w;
      color += secondary * dustVeil * 0.012;

      vec2 sunCenter = vec2(
        mix(0.72, 0.24, scenePhase),
        mix(0.26, -0.34, sin(scenePhase * PI) * 0.5 + 0.5)
      );
      sunCenter += pointer * 0.035;
      vec2 sunVector = bentPoint - sunCenter;
      float sunRadius = length(sunVector);
      float sunAngle = atan(sunVector.y, sunVector.x);
      float coronaNoise = fbm(vec2(sunAngle * 2.2, sunRadius * 4.2 - slowTime * 2.0));
      float coronaBand = exp(-abs(sunRadius - 0.42) * (7.5 + coronaNoise * 6.0));
      float coronaRays = pow(saturate(coronaNoise - 0.42), 2.2) / (0.18 + sunRadius * 2.8);
      float solarBloom = exp(-sunRadius * 2.8) * 0.17;
      float darkDisc = 1.0 - smoothstep(0.18, 0.285, sunRadius);
      color += primary * (coronaBand * 0.36 + coronaRays * 0.55 + solarBloom) * profile.x;
      color *= 1.0 - darkDisc * 0.42 * profile.x;

      float lensRing = exp(-pow(abs(lensRadius - 0.36) * 13.0, 2.0));
      float photonArc = exp(-pow(abs(lensRadius - 0.405) * 26.0, 2.0));
      photonArc *= 0.42 + 0.58 * pow(abs(sin(atan(lensVector.y, lensVector.x))), 5.0);
      color += secondary * lensRing * 0.12 * profile.y;
      color += mix(secondary, vec3(1.0, 0.91, 0.73), 0.55) * photonArc * 0.27 * profile.y;

      vec2 riftPoint = rotate2d(-0.58 + scenePhase * 1.14) * point;
      float riftPath = riftPoint.x
        + sin(riftPoint.y * 2.15 + slowTime * 1.4 + scenePhase * 4.0) * 0.065
        - mix(-0.34, 0.3, scenePhase);
      float riftDistance = abs(riftPath);
      float riftCore = exp(-riftDistance * 150.0);
      float riftBloom = exp(-riftDistance * 19.0) * 0.16;
      float riftGate = smoothstep(1.42, 0.12, abs(riftPoint.y));
      color += mix(secondary, primary, 0.36) * (riftCore + riftBloom) * riftGate * profile.z;

      float warp = velocity * (0.7 + profile.z * 0.55);
      vec2 starPoint = flowPoint;
      starPoint.y += uTime * (0.008 + velocity * 0.19);
      color += renderStars(starPoint, 9.0, 2.7, 0.78, warp, primary, secondary);
      color += renderStars(starPoint * 1.13 + 1.7, 18.0, 7.1, 0.66, warp, primary, secondary);
      if (uQuality > 0.72) {
        color += renderStars(starPoint * 1.37 - 3.2, 31.0, 13.4, 0.42, warp, primary, secondary);
      }

      vec2 pointerVector = point - pointer;
      float pointerDistance = length(pointerVector);
      float pointerGravity = exp(-pointerDistance * 4.4) * uPointer.z;
      float shockRadius = (1.0 - uPointer.w) * 1.05;
      float shock = exp(-pow(abs(pointerDistance - shockRadius) * 28.0, 2.0));
      color += secondary * pointerGravity * 0.035;
      color += mix(primary, secondary, 0.45) * shock * uPointer.w * 0.22;

      float edge = 1.0 - smoothstep(0.42, 1.42, length(point * vec2(0.72, 0.9)));
      color *= mix(0.48, 1.0, edge);
      float fixedGrain = hash21(pixel * 0.5) - 0.5;
      color += fixedGrain * 0.009;

      color = 1.0 - exp(-color * 1.18);
      color = pow(max(color, 0.0), vec3(0.9));
      outColor = vec4(color, 1.0);
    }
  `;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to allocate a WebGL shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error.';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to allocate a WebGL program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Unknown WebGL link error.';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  class WebGLRenderer {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.options = options;
      this.gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: Boolean(options.preserveDrawingBuffer),
      });
      if (!this.gl) throw new Error('WEBGL2_UNAVAILABLE');
      this.kind = 'webgl2';
      this.program = null;
      this.vertexArray = null;
      this.uniforms = null;
      this.initializeResources();
    }

    initializeResources() {
      const gl = this.gl;
      this.program = createProgram(gl);
      this.vertexArray = gl.createVertexArray();
      if (!this.vertexArray) throw new Error('Unable to allocate a WebGL vertex array.');
      this.uniforms = {
        resolution: gl.getUniformLocation(this.program, 'uResolution'),
        time: gl.getUniformLocation(this.program, 'uTime'),
        pointer: gl.getUniformLocation(this.program, 'uPointer'),
        scroll: gl.getUniformLocation(this.program, 'uScroll'),
        velocity: gl.getUniformLocation(this.program, 'uVelocity'),
        scene: gl.getUniformLocation(this.program, 'uScene'),
        quality: gl.getUniformLocation(this.program, 'uQuality'),
      };
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearColor(0.0015, 0.0035, 0.0085, 1);
    }

    resize(width, height) {
      this.gl.viewport(0, 0, width, height);
    }

    render(frame) {
      const gl = this.gl;
      if (!this.program || gl.isContextLost()) return;
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vertexArray);
      gl.uniform2f(this.uniforms.resolution, frame.pixelWidth, frame.pixelHeight);
      gl.uniform1f(this.uniforms.time, frame.time);
      gl.uniform4f(
        this.uniforms.pointer,
        frame.pointerX,
        frame.pointerY,
        frame.pointerActivity,
        frame.pointerShock
      );
      gl.uniform1f(this.uniforms.scroll, frame.scrollProgress);
      gl.uniform1f(this.uniforms.velocity, frame.scrollVelocity);
      gl.uniform1f(this.uniforms.scene, frame.scene);
      gl.uniform1f(this.uniforms.quality, frame.quality);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    restore() {
      this.gl = this.canvas.getContext('webgl2');
      if (!this.gl) throw new Error('WebGL2 context could not be restored.');
      this.initializeResources();
    }

    destroy() {
      const gl = this.gl;
      if (!gl || gl.isContextLost()) return;
      if (this.vertexArray) gl.deleteVertexArray(this.vertexArray);
      if (this.program) gl.deleteProgram(this.program);
      this.vertexArray = null;
      this.program = null;
    }
  }

  function seededRandom(seed) {
    const sine = Math.sin(seed * 91.3458) * 47453.5453;
    return sine - Math.floor(sine);
  }

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((character) => character + character).join('')
      : value;
    const number = Number.parseInt(normalized, 16);
    return {
      r: (number >> 16) & 255,
      g: (number >> 8) & 255,
      b: number & 255,
    };
  }

  function mixColor(from, to, amount) {
    return {
      r: Math.round(lerp(from.r, to.r, amount)),
      g: Math.round(lerp(from.g, to.g, amount)),
      b: Math.round(lerp(from.b, to.b, amount)),
    };
  }

  function rgba(color, alpha) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  const FALLBACK_PALETTES = [
    ['#ff5e12', '#226fe8'],
    ['#ff9a32', '#f4dfb2'],
    ['#2479ff', '#f1cf93'],
    ['#ff6c17', '#236fe0'],
    ['#d3e1ff', '#ff7818'],
    ['#ff8c23', '#f0e3c9'],
  ].map(([primary, secondary]) => [hexToRgb(primary), hexToRgb(secondary)]);

  class CanvasRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: false });
      if (!this.context) throw new Error('Canvas 2D is unavailable.');
      this.kind = 'canvas2d';
      this.stars = Array.from({ length: 520 }, (_, index) => ({
        x: seededRandom(index * 3.71 + 1.1),
        y: seededRandom(index * 7.93 + 4.6),
        depth: 0.18 + seededRandom(index * 5.17 + 8.2) * 0.82,
        size: 0.35 + seededRandom(index * 11.31 + 2.8) * 1.65,
        warmth: seededRandom(index * 13.73 + 6.4),
      }));
    }

    resize() {}

    drawDust(frame, primary, secondary) {
      const context = this.context;
      const width = frame.pixelWidth;
      const height = frame.pixelHeight;
      const phase = frame.scene / (SCENE_COUNT - 1);
      for (let index = 0; index < 4; index += 1) {
        const x = width * (0.12 + ((index * 0.29 + phase * 0.16) % 0.9));
        const y = height * (0.16 + ((index * 0.23 + phase * 0.31) % 0.74));
        const radius = Math.max(width, height) * (0.26 + index * 0.055);
        const color = index % 2 ? primary : secondary;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, rgba(color, 0.035));
        gradient.addColorStop(0.42, rgba(color, 0.014));
        gradient.addColorStop(1, rgba(color, 0));
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }
    }

    drawCorona(frame, primary) {
      const context = this.context;
      const width = frame.pixelWidth;
      const height = frame.pixelHeight;
      const phase = frame.scene / (SCENE_COUNT - 1);
      const x = width * lerp(0.82, 0.56, phase) + frame.pointerX * width * 0.015;
      const y = height * lerp(0.32, 0.68, phase) - frame.pointerY * height * 0.015;
      const radius = Math.min(width, height) * lerp(0.18, 0.29, Math.sin(phase * Math.PI));
      const bloom = context.createRadialGradient(x, y, radius * 0.04, x, y, radius * 2.4);
      bloom.addColorStop(0, rgba(primary, 0.02));
      bloom.addColorStop(0.36, rgba(primary, 0.1));
      bloom.addColorStop(0.52, rgba(primary, 0.055));
      bloom.addColorStop(1, rgba(primary, 0));
      context.fillStyle = bloom;
      context.fillRect(0, 0, width, height);

      context.save();
      context.strokeStyle = rgba(primary, 0.32);
      context.lineWidth = Math.max(1, radius * 0.012);
      context.shadowBlur = radius * 0.24;
      context.shadowColor = rgba(primary, 0.46);
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.stroke();
      context.restore();
    }

    drawLensAndRift(frame, primary, secondary) {
      const context = this.context;
      const width = frame.pixelWidth;
      const height = frame.pixelHeight;
      const phase = frame.scene / (SCENE_COUNT - 1);
      const lensX = width * lerp(0.72, 0.42, phase) + frame.pointerX * width * 0.035;
      const lensY = height * (0.48 + Math.sin(phase * TAU) * 0.09) - frame.pointerY * height * 0.035;
      const lensRadius = Math.min(width, height) * 0.19;

      context.save();
      context.strokeStyle = rgba(secondary, 0.18);
      context.lineWidth = Math.max(1, lensRadius * 0.018);
      context.shadowBlur = lensRadius * 0.2;
      context.shadowColor = rgba(secondary, 0.3);
      context.beginPath();
      context.ellipse(lensX, lensY, lensRadius * 1.28, lensRadius, phase * 0.6, 0, TAU);
      context.stroke();
      context.restore();

      context.save();
      context.translate(width * lerp(0.28, 0.68, phase), height * 0.5);
      context.rotate(lerp(-0.58, 0.56, phase));
      context.strokeStyle = rgba(mixColor(primary, secondary, 0.42), 0.3);
      context.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
      context.shadowBlur = Math.min(width, height) * 0.045;
      context.shadowColor = rgba(primary, 0.42);
      context.beginPath();
      context.moveTo(-width * 0.12, -height * 0.7);
      context.bezierCurveTo(
        width * 0.04,
        -height * 0.22,
        -width * 0.07,
        height * 0.21,
        width * 0.08,
        height * 0.72
      );
      context.stroke();
      context.restore();
    }

    drawStars(frame, primary, secondary) {
      const context = this.context;
      const width = frame.pixelWidth;
      const height = frame.pixelHeight;
      const limit = Math.round(lerp(190, this.stars.length, frame.quality));
      const warp = Math.abs(frame.scrollVelocity) * height * 0.022;
      context.save();
      context.globalCompositeOperation = 'screen';
      for (let index = 0; index < limit; index += 1) {
        const star = this.stars[index];
        const drift = frame.time * (0.0015 + star.depth * 0.004) + frame.scrollProgress * star.depth;
        const x = ((star.x + frame.pointerX * 0.012 * star.depth) % 1 + 1) % 1 * width;
        const y = ((star.y + drift) % 1 + 1) % 1 * height;
        const size = star.size * (0.45 + star.depth) * Math.max(1, frame.dpr * 0.66);
        const color = mixColor(secondary, primary, star.warmth);
        context.strokeStyle = rgba(color, 0.32 + star.depth * 0.55);
        context.lineWidth = size;
        context.beginPath();
        context.moveTo(x, y - warp * star.depth);
        context.lineTo(x, y + Math.max(size * 0.35, warp * star.depth));
        context.stroke();
      }
      context.restore();
    }

    render(frame) {
      const context = this.context;
      const scene = clamp(frame.scene, 0, SCENE_COUNT - 1);
      const index = Math.floor(scene);
      const amount = scene - index;
      const next = Math.min(index + 1, SCENE_COUNT - 1);
      const primary = mixColor(FALLBACK_PALETTES[index][0], FALLBACK_PALETTES[next][0], amount);
      const secondary = mixColor(FALLBACK_PALETTES[index][1], FALLBACK_PALETTES[next][1], amount);

      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#01040a';
      context.fillRect(0, 0, frame.pixelWidth, frame.pixelHeight);
      this.drawDust(frame, primary, secondary);
      this.drawCorona(frame, primary);
      this.drawLensAndRift(frame, primary, secondary);
      this.drawStars(frame, primary, secondary);

      const vignette = context.createRadialGradient(
        frame.pixelWidth * 0.5,
        frame.pixelHeight * 0.48,
        Math.min(frame.pixelWidth, frame.pixelHeight) * 0.18,
        frame.pixelWidth * 0.5,
        frame.pixelHeight * 0.48,
        Math.max(frame.pixelWidth, frame.pixelHeight) * 0.72
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
      context.fillStyle = vignette;
      context.fillRect(0, 0, frame.pixelWidth, frame.pixelHeight);
    }

    restore() {}
    destroy() {}
  }

  class GoodMoodCosmosController {
    constructor(canvas, options = {}) {
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new TypeError('GoodMoodCosmos.create requires a canvas element.');
      }

      this.canvas = canvas;
      this.options = options;
      this.destroyed = false;
      this.contextLost = false;
      this.running = false;
      this.manualPaused = options.autoStart === false;
      this.visibilityPaused = false;
      this.frameRequest = 0;
      this.lastFrameAt = 0;
      this.elapsed = 0;
      this.staticDrawn = false;
      this.explicitWidth = 0;
      this.explicitHeight = 0;
      this.explicitDpr = 0;

      const reducedByPreference = options.reducedMotion == null
        ? mediaMatches('(prefers-reduced-motion: reduce)')
        : Boolean(options.reducedMotion);
      const reducedByData = options.respectSaveData !== false && connectionSavesData();
      this.staticMode = Boolean(options.static || reducedByPreference || reducedByData);
      this.coarsePointer = mediaMatches('(pointer: coarse)');
      this.targetFrameMs = this.coarsePointer ? 1000 / 30 : 1000 / 50;

      const startingQuality = this.staticMode
        ? QUALITY_SCALES.length - 1
        : this.pickStartingQuality(options.quality);
      this.qualityIndex = startingQuality;
      this.performanceWindow = { total: 0, count: 0, lastChangeAt: 0 };

      this.input = {
        pointerX: 0,
        pointerY: 0,
        pointerTargetX: 0,
        pointerTargetY: 0,
        pointerActivity: 0,
        pointerActivityTarget: 0,
        pointerShock: 0,
        scrollProgress: 0,
        scrollVelocity: 0,
        scrollVelocityTarget: 0,
        scene: 0,
        sceneTarget: 0,
      };

      this.cssWidth = 1;
      this.cssHeight = 1;
      this.pixelWidth = 1;
      this.pixelHeight = 1;
      this.dpr = 1;
      this.renderer = this.createRenderer();
      this.mode = this.renderer.kind;

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerLeave = this.onPointerLeave.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);
      this.onContextLost = this.onContextLost.bind(this);
      this.onContextRestored = this.onContextRestored.bind(this);

      this.lastScrollY = finite(global.scrollY, 0);
      this.lastScrollAt = now();
      this.installListeners();
      this.readScrollPosition();
      this.resize();
      this.renderStaticFrame();

      if (!this.staticMode && !this.manualPaused && !this.visibilityPaused) {
        this.resume();
      }

      notify(this.options, 'onReady', { controller: this, mode: this.mode });
    }

    pickStartingQuality(requested) {
      if (Number.isFinite(requested)) {
        const normalized = clamp(requested, 0, 1);
        return Math.round(normalized * (QUALITY_SCALES.length - 1));
      }
      const cores = finite(global.navigator && navigator.hardwareConcurrency, 4);
      if (this.coarsePointer || cores <= 4) return 1;
      return cores >= 8 ? 3 : 2;
    }

    createRenderer() {
      if (this.options.forceCanvas2D !== true) {
        try {
          return new WebGLRenderer(this.canvas, this.options);
        } catch (error) {
          if (!error || error.message !== 'WEBGL2_UNAVAILABLE') {
            notify(this.options, 'onError', { phase: 'webgl', error });
          }
        }
      }

      try {
        return new CanvasRenderer(this.canvas);
      } catch (error) {
        notify(this.options, 'onError', { phase: 'canvas2d', error });
        throw error;
      }
    }

    installListeners() {
      this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
      this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);

      if (this.options.autoResize !== false) {
        global.addEventListener('resize', this.onResize, { passive: true });
      }
      if (this.options.autoPause !== false && global.document) {
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.visibilityPaused = document.hidden;
      }
      if (!this.staticMode && this.options.autoInput !== false) {
        global.addEventListener('pointermove', this.onPointerMove, { passive: true });
        global.addEventListener('pointerdown', this.onPointerDown, { passive: true });
        global.addEventListener('pointerup', this.onPointerLeave, { passive: true });
        global.addEventListener('pointercancel', this.onPointerLeave, { passive: true });
        global.addEventListener('blur', this.onPointerLeave);
        global.addEventListener('scroll', this.onScroll, { passive: true });
      }
    }

    removeListeners() {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
      global.removeEventListener('resize', this.onResize);
      global.removeEventListener('pointermove', this.onPointerMove);
      global.removeEventListener('pointerdown', this.onPointerDown);
      global.removeEventListener('pointerup', this.onPointerLeave);
      global.removeEventListener('pointercancel', this.onPointerLeave);
      global.removeEventListener('blur', this.onPointerLeave);
      global.removeEventListener('scroll', this.onScroll);
      if (global.document) document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }

    onResize() {
      this.resize();
    }

    onPointerMove(event) {
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      this.input.pointerTargetX = clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1.4, 1.4);
      this.input.pointerTargetY = clamp(1 - ((event.clientY - bounds.top) / bounds.height) * 2, -1.4, 1.4);
      this.input.pointerActivityTarget = event.pointerType === 'touch' ? 0.72 : 1;
    }

    onPointerDown(event) {
      this.onPointerMove(event);
      this.input.pointerShock = 1;
      this.input.pointerActivityTarget = 1;
    }

    onPointerLeave() {
      this.input.pointerActivityTarget = 0;
    }

    readScrollPosition() {
      const root = global.document && document.documentElement;
      const scrollTop = finite(global.scrollY, root ? root.scrollTop : 0);
      const range = root ? Math.max(1, root.scrollHeight - global.innerHeight) : 1;
      this.input.scrollProgress = clamp(scrollTop / range, 0, 1);
      this.input.sceneTarget = this.input.scrollProgress * (SCENE_COUNT - 1);
    }

    onScroll() {
      const timestamp = now();
      const scrollY = finite(global.scrollY, 0);
      const deltaTime = clamp(timestamp - this.lastScrollAt, 8, 80);
      const deltaY = scrollY - this.lastScrollY;
      const viewport = Math.max(1, global.innerHeight || this.cssHeight);
      this.input.scrollVelocityTarget = clamp((deltaY / viewport) * (48 / deltaTime), -1, 1);
      this.lastScrollY = scrollY;
      this.lastScrollAt = timestamp;
      this.readScrollPosition();
    }

    onVisibilityChange() {
      if (!global.document) return;
      this.visibilityPaused = document.hidden;
      if (this.visibilityPaused) {
        this.stopLoop();
      } else if (!this.manualPaused) {
        this.resume();
      }
    }

    onContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
      this.stopLoop();
      notify(this.options, 'onContextLost', { controller: this });
    }

    onContextRestored() {
      if (this.destroyed) return;
      try {
        this.renderer.restore();
        this.contextLost = false;
        this.resize();
        this.staticDrawn = false;
        this.renderStaticFrame();
        if (!this.staticMode && !this.manualPaused && !this.visibilityPaused) this.resume();
        notify(this.options, 'onContextRestored', { controller: this });
      } catch (error) {
        this.contextLost = true;
        notify(this.options, 'onError', { phase: 'context-restored', error });
      }
    }

    setInput(next = {}) {
      if (this.destroyed || !next || typeof next !== 'object') return this;
      const pointer = next.pointer && typeof next.pointer === 'object' ? next.pointer : null;
      const pointerX = pointer ? pointer.x : next.pointerX;
      const pointerY = pointer ? pointer.y : next.pointerY;
      const pointerActive = pointer ? pointer.active : next.pointerActive;
      const pointerShock = pointer ? pointer.shock : next.pointerShock;

      if (Number.isFinite(pointerX)) this.input.pointerTargetX = clamp(pointerX, -1.4, 1.4);
      if (Number.isFinite(pointerY)) this.input.pointerTargetY = clamp(pointerY, -1.4, 1.4);
      if (Number.isFinite(pointerActive)) {
        this.input.pointerActivityTarget = clamp(pointerActive, 0, 1);
      } else if (pointerActive === true) {
        this.input.pointerActivityTarget = 1;
      } else if (pointerActive === false) {
        this.input.pointerActivityTarget = 0;
      }
      if (Number.isFinite(pointerShock)) this.input.pointerShock = clamp(pointerShock, 0, 1);

      if (Number.isFinite(next.scrollProgress)) {
        this.input.scrollProgress = clamp(next.scrollProgress, 0, 1);
      }
      if (Number.isFinite(next.scrollVelocity)) {
        this.input.scrollVelocityTarget = clamp(next.scrollVelocity, -1, 1);
      }

      if (Number.isFinite(next.scene)) {
        const section = clamp(next.scene, 0, SCENE_COUNT - 1);
        const blend = Number.isFinite(next.sceneMix) ? clamp(next.sceneMix, 0, 1) : 0;
        this.input.sceneTarget = clamp(section + blend, 0, SCENE_COUNT - 1);
      } else if (Number.isFinite(next.currentSection)) {
        const section = clamp(next.currentSection, 0, SCENE_COUNT - 1);
        const blend = Number.isFinite(next.sceneMix) ? clamp(next.sceneMix, 0, 1) : 0;
        this.input.sceneTarget = clamp(section + blend, 0, SCENE_COUNT - 1);
      } else if (Number.isFinite(next.scrollProgress)) {
        this.input.sceneTarget = this.input.scrollProgress * (SCENE_COUNT - 1);
      }

      if (Number.isFinite(next.time)) this.elapsed = Math.max(0, next.time);
      return this;
    }

    resize(width, height, pixelRatio) {
      if (this.destroyed) return this;
      if (width && typeof width === 'object') {
        const dimensions = width;
        width = dimensions.width;
        height = dimensions.height;
        pixelRatio = dimensions.pixelRatio || dimensions.dpr;
      }

      this.explicitWidth = Number.isFinite(width) && width > 0 ? width : 0;
      this.explicitHeight = Number.isFinite(height) && height > 0 ? height : 0;
      this.explicitDpr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 0;

      const bounds = this.canvas.getBoundingClientRect();
      this.cssWidth = Math.max(1, this.explicitWidth || bounds.width || this.canvas.clientWidth || global.innerWidth || 1);
      this.cssHeight = Math.max(1, this.explicitHeight || bounds.height || this.canvas.clientHeight || global.innerHeight || 1);
      const dprLimit = Number.isFinite(this.options.dprCap)
        ? Math.max(0.5, this.options.dprCap)
        : (this.coarsePointer ? 1.35 : 1.8);
      const deviceDpr = this.explicitDpr || finite(global.devicePixelRatio, 1);
      const qualityScale = QUALITY_SCALES[this.qualityIndex];
      this.dpr = Math.min(deviceDpr, dprLimit) * qualityScale;
      this.pixelWidth = Math.max(2, Math.round(this.cssWidth * this.dpr));
      this.pixelHeight = Math.max(2, Math.round(this.cssHeight * this.dpr));

      if (this.canvas.width !== this.pixelWidth) this.canvas.width = this.pixelWidth;
      if (this.canvas.height !== this.pixelHeight) this.canvas.height = this.pixelHeight;
      this.renderer.resize(this.pixelWidth, this.pixelHeight);

      if (this.staticMode) {
        this.staticDrawn = false;
        this.renderStaticFrame();
      }
      return this;
    }

    frameState(time) {
      return {
        time,
        pixelWidth: this.pixelWidth,
        pixelHeight: this.pixelHeight,
        dpr: this.dpr,
        pointerX: this.input.pointerX,
        pointerY: this.input.pointerY,
        pointerActivity: this.input.pointerActivity,
        pointerShock: this.input.pointerShock,
        scrollProgress: this.input.scrollProgress,
        scrollVelocity: this.input.scrollVelocity,
        scene: this.input.scene,
        quality: QUALITY_SCALES[this.qualityIndex],
      };
    }

    renderStaticFrame() {
      if (!this.staticMode || this.staticDrawn || this.destroyed || this.contextLost) return;
      this.input.pointerX = 0;
      this.input.pointerY = 0;
      this.input.pointerActivity = 0;
      this.input.pointerShock = 0;
      this.input.scrollVelocity = 0;
      this.input.scene = this.input.sceneTarget;
      this.renderer.render(this.frameState(STATIC_TIME));
      this.staticDrawn = true;
    }

    updateInput(deltaSeconds) {
      const pointerEase = 1 - Math.exp(-deltaSeconds * 7.5);
      const sceneEase = 1 - Math.exp(-deltaSeconds * 3.2);
      const velocityEase = 1 - Math.exp(-deltaSeconds * 10);
      this.input.pointerX = lerp(this.input.pointerX, this.input.pointerTargetX, pointerEase);
      this.input.pointerY = lerp(this.input.pointerY, this.input.pointerTargetY, pointerEase);
      this.input.pointerActivity = lerp(
        this.input.pointerActivity,
        this.input.pointerActivityTarget,
        pointerEase
      );
      this.input.scene = lerp(this.input.scene, this.input.sceneTarget, sceneEase);
      this.input.scrollVelocity = lerp(
        this.input.scrollVelocity,
        this.input.scrollVelocityTarget,
        velocityEase
      );
      this.input.scrollVelocityTarget *= Math.exp(-deltaSeconds * 5.4);
      this.input.pointerShock *= Math.exp(-deltaSeconds * 2.45);
    }

    adaptQuality(deltaMs, timestamp) {
      if (deltaMs > 80 || timestamp - this.performanceWindow.lastChangeAt < 2200) return;
      this.performanceWindow.total += deltaMs;
      this.performanceWindow.count += 1;
      if (this.performanceWindow.count < 90) return;

      const average = this.performanceWindow.total / this.performanceWindow.count;
      let nextIndex = this.qualityIndex;
      if (average > this.targetFrameMs * 1.16 && nextIndex > 0) {
        nextIndex -= 1;
      } else if (average < this.targetFrameMs * 0.72 && nextIndex < QUALITY_SCALES.length - 1) {
        nextIndex += 1;
      }
      this.performanceWindow.total = 0;
      this.performanceWindow.count = 0;

      if (nextIndex !== this.qualityIndex) {
        this.qualityIndex = nextIndex;
        this.performanceWindow.lastChangeAt = timestamp;
        this.resize(this.explicitWidth, this.explicitHeight, this.explicitDpr);
        notify(this.options, 'onQualityChange', {
          quality: QUALITY_SCALES[this.qualityIndex],
          mode: this.mode,
        });
      }
    }

    onFrame(timestamp) {
      if (!this.running || this.destroyed || this.contextLost) return;
      const deltaMs = this.lastFrameAt
        ? clamp(timestamp - this.lastFrameAt, 1, 50)
        : this.targetFrameMs;
      this.lastFrameAt = timestamp;
      const deltaSeconds = deltaMs / 1000;
      this.elapsed += deltaSeconds;
      this.updateInput(deltaSeconds);
      this.renderer.render(this.frameState(this.elapsed));
      this.adaptQuality(deltaMs, timestamp);
      this.frameRequest = global.requestAnimationFrame(this.onFrame);
    }

    stopLoop() {
      this.running = false;
      if (this.frameRequest) global.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
      this.lastFrameAt = 0;
    }

    pause() {
      if (this.destroyed) return this;
      this.manualPaused = true;
      this.stopLoop();
      return this;
    }

    resume() {
      if (this.destroyed) return this;
      this.manualPaused = false;
      if (this.staticMode) {
        this.renderStaticFrame();
        return this;
      }
      if (this.visibilityPaused || this.contextLost || this.running) return this;
      this.running = true;
      this.lastFrameAt = 0;
      this.frameRequest = global.requestAnimationFrame(this.onFrame);
      return this;
    }

    destroy() {
      if (this.destroyed) return;
      this.stopLoop();
      this.removeListeners();
      this.renderer.destroy();
      this.destroyed = true;
      notify(this.options, 'onDestroy', { controller: this });
    }
  }

  function create(canvas, options) {
    return new GoodMoodCosmosController(canvas, options || {});
  }

  global.GoodMoodCosmos = Object.freeze({
    create,
    version: '1.0.0',
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
