/* Brand colours must render exactly as the brand uses them — Noon's yellow is
   #FEEE00, not a darkened gold. But a bright colour on a white surface is
   nearly invisible, so instead of dimming the colour we keep it at full
   strength and derive a same-hue EDGE colour, dark enough to outline it.
   Noon does the same thing: yellow fill, near-black paired with it. */
/* the theme is read from the document when the caller doesn't say, so the
   pure colour maths can also be exercised outside a browser */
const isDarkTheme = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
const cbrt = Math.cbrt, cl = (v,a=0,b=1) => Math.min(b, Math.max(a,v));
const s2l = v => v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4);
const l2s = v => v <= .0031308 ? v*12.92 : 1.055*Math.pow(v,1/2.4) - .055;
function hex2rgb(h){ const n = parseInt(h.slice(1),16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]; }
function rgb2hex(r,g,b){ return '#' + [r,g,b].map(v => Math.round(cl(v)*255).toString(16).padStart(2,'0')).join(''); }
function oklch(hex){
  const [r,g,b] = hex2rgb(hex).map(s2l);
  const l = cbrt(.4122214708*r + .5363325363*g + .0514459929*b),
        m = cbrt(.2119034982*r + .6806995451*g + .1073969566*b),
        s = cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  const L = .2104542553*l + .7936177850*m - .0040720468*s,
        A = 1.9779984951*l - 2.4285922050*m + .4505937099*s,
        B = .0259040371*l + .7827717662*m - .8086757660*s;
  return {L, C:Math.hypot(A,B), h:Math.atan2(B,A)};
}
function oklchRGB(L,C,h){
  const A = C*Math.cos(h), B = C*Math.sin(h);
  const l = (L + .3963377774*A + .2158037573*B)**3,
        m = (L - .1055613458*A - .0638541728*B)**3,
        s = (L - .0894841775*A - 1.2914855480*B)**3;
  return [ 4.0767416621*l - 3.3077115913*m + .2309699292*s,
          -1.2684380046*l + 2.6097574011*m - .3413193965*s,
          -.0041960863*l - .7034186147*m + 1.7076147010*s];
}
const inGamut = c => c.every(v => v >= -.001 && v <= 1.001);
function fromOklch(L,C,h){
  let c = C;                                   /* back off chroma only as far as gamut demands */
  for(let i=0; i<60 && !inGamut(oklchRGB(L,c,h)); i++) c *= .96;
  const [r,g,b] = oklchRGB(L,c,h).map(l2s);
  return rgb2hex(r,g,b);
}
function lum(hex){ const [r,g,b] = hex2rgb(hex).map(s2l); return .2126*r + .7152*g + .0722*b; }
function contrast(a,b){ const [x,y] = [lum(a),lum(b)].sort((m,n) => n-m); return (x+.05)/(y+.05); }

/* the outline colour: same hue, moved in OKLCH only until it clears 3:1 */
function edgeColor(hex, dark){
  if(!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if(dark === undefined) dark = isDarkTheme();
  const surface = dark ? '#1A201D' : '#FFFFFF';
  if(contrast(hex, surface) >= 3.05) return hex;   /* already visible — leave it alone */
  let {L,C,h} = oklch(hex);
  const dir = dark ? 1 : -1;
  let out = fromOklch(L,C,h);
  for(let i=0; i<60 && contrast(out,surface) < 3.05; i++){
    L = cl(L + dir*.012, .05, .99);
    out = fromOklch(L,C,h);
  }
  return out;
}
/* Dark mode: a raw brand colour can be far brighter against a dark surface
   than the rest of the palette (Noon's yellow hits ~13:1 where Lulu's green
   sits at ~5:1), which reads as glare rather than colour-coding. Hold every
   fill inside a band so no single retailer shouts. Light mode keeps the brand
   colour exact, since the edge outline handles visibility there. */
const DARK_CEILING = 10.5;
function fillColor(hex, dark){
  if(!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if(dark === undefined) dark = isDarkTheme();
  if(!dark) return hex;
  const surface = '#1A201D';
  if(contrast(hex, surface) <= DARK_CEILING) return hex;
  let {L,C,h} = oklch(hex), out = hex;
  for(let i=0; i<60 && contrast(out, surface) > DARK_CEILING; i++){
    L = cl(L - .012, .05, .99);
    out = fromOklch(L,C,h);
  }
  return out;
}

/* --rc is the fill; --rc-edge only outlines it when the fill is too close
   to the surface to be seen on its own */
function paint(el, hex){
  const fill = fillColor(hex);
  el.style.setProperty('--rc', fill);
  el.style.setProperty('--rc-edge', edgeColor(fill));
}

export {oklch, fromOklch, lum, contrast, edgeColor, fillColor, paint, DARK_CEILING};
