/* Liquid-metal CTA — vanilla port of the MetallicButton WebGL shader.
 *
 * The landing page is a static HTML mirror with no React and no Tailwind, so
 * the component cannot be mounted there. The shader and its uniform set are
 * copied verbatim; only the React plumbing (state, refs, observers) is
 * replaced by direct DOM wiring. Same visual result, no build step.
 */
(function () {
  "use strict";

  var VERTEX_SHADER = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) {
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) {
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  vec2 objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;
}`;

  var FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorTint;

uniform float u_softness;
uniform float u_repetition;
uniform float u_shiftRed;
uniform float u_shiftBlue;
uniform float u_distortion;
uniform float u_contour;
uniform float u_angle;

in vec2 v_objectUV;
in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;

out vec4 fragColor;

#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {
  float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

  float border = w[0];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .4 * (1. - bump) * w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .5 * (1. - bump) * w[1];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  return ch;
}

void main() {
  const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);

  vec2 uv = v_objectUV + .5;
  uv.y = 1. - uv.y;

  float cycleWidth = u_repetition;
  float edge = 0.;

  vec2 rotatedUV = uv - vec2(.5);
  float angle = (-u_angle + 70.) * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  rotatedUV = vec2(
  rotatedUV.x * cosA - rotatedUV.y * sinA,
  rotatedUV.x * sinA + rotatedUV.y * cosA
  ) + vec2(.5);

  vec2 shapeUV = uv - .5;
  shapeUV *= .67;
  edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);

  edge = mix(smoothstep(.9 - 2. * fwidth(edge), .9, edge), edge, smoothstep(0.0, 0.4, u_contour));

  float opacity = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
  edge = 1.2 * edge;

  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  vec3 color = vec3(0.);
  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

  vec2 grad_uv = uv - .5;

  float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  float bump = pow(1.8 * dist, 1.2);
  bump = 1. - bump;
  bump *= pow(uv.y, .3);

  float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
  float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = snoise(uv - t);

  edge += (1. - edge) * u_distortion * noise;

  direction += diagBLtoTR;
  float contour = 0.;
  direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
  direction *= mix(1., 1. - edge, smoothstep(.5, 1., u_contour));
  direction -= 1.7 * edge * smoothstep(.5, 1., u_contour);
  direction += .2 * pow(u_contour, 4.) * (1.0 - smoothstep(0., 1., edge));

  bump *= clamp(pow(uv.y, .1), .3, 1.);
  direction *= (.1 + (1.1 - edge) * bump);

  direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
  direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
  direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

  direction *= (.5 + .5 * pow(uv.y, 2.));
  direction *= cycleWidth;
  direction -= t;

  float colorDispersion = (1. - bump);
  colorDispersion = clamp(colorDispersion, 0., 1.);
  float dispersionRed = colorDispersion;
  dispersionRed += .03 * bump * noise;
  dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
  dispersionBlue -= .2 * edge;

  dispersionRed *= (u_shiftRed / 20.);
  dispersionBlue *= (u_shiftBlue / 20.);

  float blur = u_softness / 15. + .3 * contour;

  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bump);
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r), bump, u_colorTint.r);
  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g), bump, u_colorTint.g);
  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, u_colorTint.b);

  color = vec3(r, g, b);
  color *= opacity;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  fragColor = vec4(color, opacity);
}`;

  // Demo defaults, straight from the component's prop defaults.
  var CONFIG = {
    colorBack: "#000000",
    colorTint: "#ffffff",
    repetition: 4,
    softness: 0.5,
    angle: 45,
    scale: 8,
    distortion: 0,
    shiftRed: 0.3,
    shiftBlue: 0.3,
  };
  var SPEED = { idle: 0.6, hover: 1, click: 2.4 };

  var UNIFORMS = [
    "u_time",
    "u_resolution",
    "u_pixelRatio",
    "u_colorBack",
    "u_colorTint",
    "u_softness",
    "u_repetition",
    "u_shiftRed",
    "u_shiftBlue",
    "u_distortion",
    "u_contour",
    "u_angle",
    "u_originX",
    "u_originY",
    "u_worldWidth",
    "u_worldHeight",
    "u_fit",
    "u_scale",
    "u_rotation",
    "u_offsetX",
    "u_offsetY",
  ];

  var MIN_PIXEL_RATIO = 2;
  var MAX_PIXEL_COUNT = 1920 * 1080 * 4;

  function parseColor(value) {
    var fallback = [1, 1, 1, 1];
    if (typeof value !== "string") return fallback;
    var hex = value.trim().replace("#", "");
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map(function (c) {
          return c + c;
        })
        .join("");
    }
    if (hex.length === 6) hex += "ff";
    if (hex.length !== 8) return fallback;
    var int = parseInt(hex, 16);
    if (isNaN(int)) return fallback;
    return [
      ((int >> 24) & 255) / 255,
      ((int >> 16) & 255) / 255,
      ((int >> 8) & 255) / 255,
      (int & 255) / 255,
    ];
  }

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("metallic-cta shader:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function MetalPill(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.loc = {};
    this.raf = null;
    this.last = 0;
    this.frameTime = 0;
    this.speed = SPEED.idle;
    this.renderScale = 1;
  }

  MetalPill.prototype.init = function () {
    var gl = this.canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: true,
      alpha: true,
    });
    if (!gl) throw new Error("WebGL2 unavailable");

    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) throw new Error("shader compile failed");

    var program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("program link failed");
    }

    this.gl = gl;
    this.program = program;

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    var position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    for (var i = 0; i < UNIFORMS.length; i++) {
      this.loc[UNIFORMS[i]] = gl.getUniformLocation(program, UNIFORMS[i]);
    }

    this.resize();
    this.draw(performance.now());
    if (this.speed !== 0) this.loop();
    return this;
  };

  MetalPill.prototype.resize = function () {
    var gl = this.gl;
    if (!gl) return;
    var width = this.canvas.clientWidth || 142;
    var height = this.canvas.clientHeight || 46;
    if (width === 0 || height === 0) return;

    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var target = Math.max(dpr, MIN_PIXEL_RATIO);
    var pw = Math.round(width) * target;
    var ph = Math.round(height) * target;
    var headroom =
      Math.sqrt(MAX_PIXEL_COUNT) / Math.sqrt(pw * ph);
    var clamp = Math.min(1, headroom);
    pw = Math.round(pw * clamp);
    ph = Math.round(ph * clamp);

    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.renderScale = pw / Math.round(width);
    gl.viewport(0, 0, pw, ph);
    this.draw(performance.now());
  };

  MetalPill.prototype.push = function () {
    var gl = this.gl;
    if (!gl) return;
    var l = this.loc;
    gl.uniform4fv(l.u_colorBack, parseColor(CONFIG.colorBack));
    gl.uniform4fv(l.u_colorTint, parseColor(CONFIG.colorTint));
    gl.uniform1f(l.u_repetition, CONFIG.repetition);
    gl.uniform1f(l.u_softness, CONFIG.softness);
    gl.uniform1f(l.u_angle, CONFIG.angle);
    gl.uniform1f(l.u_distortion, CONFIG.distortion);
    gl.uniform1f(l.u_shiftRed, CONFIG.shiftRed);
    gl.uniform1f(l.u_shiftBlue, CONFIG.shiftBlue);
    gl.uniform1f(l.u_contour, 0);
    gl.uniform1f(l.u_scale, CONFIG.scale);
    gl.uniform1f(l.u_fit, 1);
    gl.uniform1f(l.u_rotation, 0);
    gl.uniform1f(l.u_offsetX, 0.1);
    gl.uniform1f(l.u_offsetY, -0.1);
    gl.uniform1f(l.u_originX, 0.5);
    gl.uniform1f(l.u_originY, 0.5);
    gl.uniform1f(l.u_worldWidth, 0);
    gl.uniform1f(l.u_worldHeight, 0);
  };

  MetalPill.prototype.draw = function (now) {
    var gl = this.gl;
    if (!gl || !this.program) return;

    var dt = now - this.last;
    this.last = now;
    if (this.speed !== 0) this.frameTime += dt * this.speed;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.uniform1f(this.loc.u_time, this.frameTime * 1e-3);
    gl.uniform2f(this.loc.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.u_pixelRatio, this.renderScale);
    this.push();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  MetalPill.prototype.tick = function () {
    var self = this;
    this.draw(performance.now());
    this.raf = requestAnimationFrame(function () {
      self.tick();
    });
  };

  MetalPill.prototype.loop = function () {
    if (this.raf !== null) return;
    this.last = performance.now();
    this.tick();
  };

  MetalPill.prototype.setSpeed = function (speed) {
    this.speed = speed;
    if (speed === 0) {
      if (this.raf !== null) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.draw(performance.now());
      return;
    }
    this.loop();
  };

  MetalPill.prototype.destroy = function () {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
    this.gl = null;
    this.program = null;
  };

  function init() {
    var el = document.querySelector(".as-cta");
    if (!el) return;
    var canvas = el.querySelector("canvas");
    if (!canvas) return;

    var reduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var pill;
    try {
      pill = new MetalPill(canvas).init();
    } catch (error) {
      // No WebGL2 (old browser, blocked GPU): keep a static chrome gradient.
      el.classList.add("as-cta--fallback");
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return;
    }

    if (reduced) pill.setSpeed(0);

    var hoverSpeed = SPEED.hover;
    el.addEventListener("mouseenter", function () {
      if (!reduced) pill.setSpeed(hoverSpeed);
    });
    el.addEventListener("mouseleave", function () {
      if (!reduced) pill.setSpeed(SPEED.idle);
    });
    el.addEventListener("mousedown", function () {
      if (!reduced) pill.setSpeed(SPEED.click);
    });
    el.addEventListener("mouseup", function () {
      if (!reduced) pill.setSpeed(hoverSpeed);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        pill.setSpeed(0);
      } else if (!reduced) {
        pill.setSpeed(SPEED.idle);
      }
    });

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(function () {
        pill.resize();
      }).observe(canvas);
    } else {
      window.addEventListener("resize", function () {
        pill.resize();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
