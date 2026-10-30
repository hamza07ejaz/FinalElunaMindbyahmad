/**
 * The browser drawing APIs pdfjs asks for, in plain JavaScript.
 *
 * pdfjs was written for a browser. It reaches for DOMMatrix, Path2D and
 * ImageData while it works out where the words are, whether or not anything is
 * being drawn — so with none of them present, even reading the text of a PDF
 * fails with "DOMMatrix is not defined".
 *
 * The usual answer is @napi-rs/canvas, which supplies real ones backed by a
 * native binary. That binary is also the thing most likely to be missing on a
 * deployed server: it is platform-specific, it arrives as an optional
 * dependency, and a lockfile written on one operating system can leave the
 * build on another without it. When that happened, every PDF stopped being
 * readable — for a reason that has nothing to do with reading text.
 *
 * So this is the floor. Reading the text of a PDF needs arithmetic, not a
 * drawing engine, and that is all this provides: a 2-D affine matrix and two
 * objects that exist to be constructed. It is never preferred over the real
 * thing — it is what keeps PDFs working when the real thing is absent.
 *
 * What it cannot do is draw, so rendering a scanned page to an image still
 * needs the native module. That path says so in words rather than failing with
 * the name of a browser API.
 */

/** A 2-D affine transform: [a c e; b d f; 0 0 1]. */
class Mat {
  constructor(init) {
    let v = [1, 0, 0, 1, 0, 0];
    if (typeof init === "string") {
      // "matrix(a, b, c, d, e, f)" — the only string form pdfjs produces.
      const n = init.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
      if (n && n.length >= 6) v = n.slice(0, 6).map(Number);
    } else if (Array.isArray(init) || ArrayBuffer.isView(init)) {
      const a = Array.from(init);
      // Either the six 2-D values or a full 4x4, which is how a browser
      // reports a 2-D matrix when asked for sixteen numbers.
      if (a.length === 6) v = a;
      else if (a.length === 16) v = [a[0], a[1], a[4], a[5], a[12], a[13]];
    } else if (init && typeof init === "object") {
      v = [init.a ?? 1, init.b ?? 0, init.c ?? 0, init.d ?? 1, init.e ?? 0, init.f ?? 0];
    }

    this.a = v[0]; this.b = v[1]; this.c = v[2]; this.d = v[3]; this.e = v[4]; this.f = v[5];
  }

  // The 4x4 names, because pdfjs reads both spellings of the same numbers.
  get m11() { return this.a; }  get m12() { return this.b; }
  get m21() { return this.c; }  get m22() { return this.d; }
  get m41() { return this.e; }  get m42() { return this.f; }
  get is2D() { return true; }
  get isIdentity() {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  multiply(o) {
    const m = o instanceof Mat ? o : new Mat(o);
    return new Mat([
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    ]);
  }

  translate(x = 0, y = 0) { return this.multiply(new Mat([1, 0, 0, 1, x, y])); }
  scale(x = 1, y = x) { return this.multiply(new Mat([x, 0, 0, y, 0, 0])); }

  rotate(deg = 0) {
    const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    return this.multiply(new Mat([cos, sin, -sin, cos, 0, 0]));
  }

  inverse() {
    const det = this.a * this.d - this.b * this.c;
    // A singular matrix has no inverse; a browser returns one full of NaN.
    if (!det) return new Mat([NaN, NaN, NaN, NaN, NaN, NaN]);
    return new Mat([
      this.d / det, -this.b / det, -this.c / det, this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    ]);
  }

  transformPoint(p = { x: 0, y: 0 }) {
    const x = p.x ?? 0, y = p.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }

  toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
}

/** Constructed and passed around while reading text; never drawn. */
class Path2DShim {
  addPath() {} moveTo() {} lineTo() {} closePath() {}
  bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {} ellipse() {} rect() {} roundRect() {}
}

class ImageDataShim {
  constructor(a, b, c) {
    // Either (width, height) or (data, width, height), as in a browser.
    if (typeof a === "number") {
      this.width = a | 0; this.height = b | 0;
      this.data = new Uint8ClampedArray(Math.max(0, this.width * this.height * 4));
    } else {
      this.data = a; this.width = b | 0;
      this.height = c != null ? c | 0 : Math.floor((a?.length ?? 0) / 4 / Math.max(1, b | 0));
    }
    this.colorSpace = "srgb";
  }
}

/**
 * Put them in place if nothing better is there.
 *
 * @returns true if anything was installed, false if real ones already exist.
 */
export function installPdfShim(g = globalThis) {
  let installed = false;
  if (!g.DOMMatrix) { g.DOMMatrix = Mat; installed = true; }
  if (!g.Path2D) { g.Path2D = Path2DShim; installed = true; }
  if (!g.ImageData) { g.ImageData = ImageDataShim; installed = true; }
  return installed;
}

export { Mat as DOMMatrixShim };
