// Regenerates src/pack/upgrade/slices.json from Mojang's slicer (https://github.com/Mojang/slicer,
// MIT licence): the tool Mojang published for cutting old combined textures (widgets.png,
// icons.png, particles.png, map_icons.png, bed and sign textures …) into the separate sprites
// newer game versions read. The pack upgrader replays these steps in the browser.
//
//   node scripts/update-gui-slices.mjs            -> slicer at the pinned commit
//   node scripts/update-gui-slices.mjs <commit>   -> another commit of the slicer
//
// The slicer describes its steps as Java code (one Main.java per game version). That code is not
// run: this script reads it as data, evaluating the small part of Java it uses (helper methods
// that return one expression, `new Box(…)`, string concatenation, integer arithmetic, text
// blocks). The few image operations written as lambdas are known by name; anything unknown fails.

import { writeFileSync } from 'node:fs';

const COMMIT = process.argv[2] ?? 'cc3ef7e12b9cdb188788c2637604b9efb35d18d6';
const STAGES = ['1.14', '1.20.2', '1.20.5', '26.2'];
const raw = (path) => `https://raw.githubusercontent.com/Mojang/slicer/${COMMIT}/${path}`;

/* tokens --------------------------------------------------------------------------------------- */

function textBlock(body) {
  // Java strips the indentation common to all lines (the closing delimiter's line counts too)
  const lines = body.replace(/^[ \t]*\r?\n/, '').split(/\r?\n/);
  const indent = Math.min(...lines.filter((l, i) => l.trim() || i === lines.length - 1).map((l) => /^[ \t]*/.exec(l)[0].length));
  return lines.map((l) => l.slice(indent).replace(/[ \t]+$/, '')).join('\n');
}

function tokenize(src) {
  const out = [];
  const re = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"""([\s\S]*?)"""|"((?:[^"\\]|\\.)*)"|(\d+)|([A-Za-z_$][\w$]*)|(::|\.\.\.|[(){}\[\],;.+\-*/%=<>?:@&|!])/y;
  for (let at = 0; at < src.length; ) {
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) throw new Error(`Can't read Java at: ${src.slice(at, at + 40)}`);
    at = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'str', v: textBlock(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'str', v: JSON.parse(`"${m[2]}"`) });
    else if (m[3] !== undefined) out.push({ t: 'num', v: Number(m[3]) });
    else if (m[4] !== undefined) out.push({ t: 'id', v: m[4] });
    else if (m[5] !== undefined) out.push({ t: 'p', v: m[5] });
  }
  return out;
}

/* class members -------------------------------------------------------------------------------- */

/** Index just past the bracket that closes the one at `i`. */
function closing(toks, i) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const open = toks[i].v;
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    if (toks[j].t !== 'p') continue;
    if (toks[j].v === open) depth++;
    else if (toks[j].v === pairs[open] && --depth === 0) return j + 1;
  }
  throw new Error('Unbalanced brackets');
}

/** Static fields (name → expression tokens) and methods (name → overloads) of the slicer's Main. */
function members(toks) {
  const fields = new Map();
  const methods = new Map();
  const start = toks.findIndex((t) => t.v === 'class');
  const bodyOpen = toks.findIndex((t, i) => i > start && t.v === '{');
  for (let i = bodyOpen + 1; i < toks.length - 1; ) {
    // modifiers, then a type, then the name
    let j = i;
    while (['private', 'public', 'static', 'final', 'protected'].includes(toks[j].v)) j++;
    // the type: an identifier with optional generics and array brackets
    j++;
    if (toks[j]?.v === '<') {
      let depth = 0;
      for (; j < toks.length; j++) {
        if (toks[j].v === '<') depth++;
        else if (toks[j].v === '>' && --depth === 0) break;
      }
      j++;
    }
    while (toks[j]?.v === '[') j += 2;
    const name = toks[j]?.v;
    if (toks[j + 1]?.v === '=') {
      let end = j + 2;
      for (; toks[end].v !== ';'; end++) if (['(', '{', '['].includes(toks[end].v)) end = closing(toks, end) - 1;
      fields.set(name, toks.slice(j + 2, end));
      i = end + 1;
    } else if (toks[j + 1]?.v === '(') {
      const paramsEnd = closing(toks, j + 1);
      const params = [];
      let varargs = false;
      // parameters: `final Type name`, `Type... name`
      let cur = [];
      for (const t of [...toks.slice(j + 2, paramsEnd - 1), { v: ',' }]) {
        if (t.v === ',' && cur.length) {
          params.push(cur[cur.length - 1].v);
          if (cur.some((c) => c.v === '...')) varargs = true;
          cur = [];
        } else cur.push(t);
      }
      let b = paramsEnd;
      while (toks[b].v !== '{') b++;
      const end = closing(toks, b);
      const list = methods.get(name) ?? [];
      list.push({ params, varargs, body: toks.slice(b + 1, end - 1) });
      methods.set(name, list);
      i = end;
    } else if (toks[i].v === '}') break;
    else throw new Error(`Unexpected member near ${toks.slice(i, i + 6).map((t) => t.v).join(' ')}`);
  }
  return { fields, methods };
}

/* evaluation ----------------------------------------------------------------------------------- */

const box = (x, y, w, h, tw, th) => ({ kind: 'box', x, y, w, h, tw, th });
const op = (...v) => ({ kind: 'op', v });
const hasLambda = (toks) => toks.some((t, i) => t.v === '-' && toks[i + 1]?.v === '>');

function interpreter(src) {
  const { fields, methods } = members(tokenize(src));
  const fieldValues = new Map();

  // image operations the slicer writes as lambdas, by name
  const natives = {
    flipFrameAxis: (n) => op('flipFrameAxis', n),
    spriteExtender: (...a) => op('extend', ...a),
    clip(...a) {
      const [inName, outName, b] = a.length === 2 ? [a[0], a[0], a[1]] : a;
      const out = { kind: 'out', path: call('nameToPath', ['minecraft', outName]), box: box(0, 0, b.tw, b.th, b.tw, b.th), ops: [op('clip', b.x, b.y, b.w, b.h, b.tw, b.th)] };
      return { kind: 'input', path: call('nameToPath', ['minecraft', inName]), outputs: [out] };
    },
  };
  const nativeFields = { SQUARE: op('square') };

  function field(name) {
    if (name in nativeFields) return nativeFields[name];
    if (!fields.has(name)) throw new Error(`Unknown name ${name}`);
    if (!fieldValues.has(name)) {
      const toks = fields.get(name);
      if (hasLambda(toks)) throw new Error(`Field ${name} is an image operation this script doesn't know`);
      fieldValues.set(name, expression(toks, new Map()));
    }
    return fieldValues.get(name);
  }

  function call(name, args) {
    if (natives[name]) return natives[name](...args);
    const overloads = methods.get(name);
    if (!overloads) throw new Error(`Unknown method ${name}`);
    const m = overloads.find((o) => (o.varargs ? args.length >= o.params.length - 1 : args.length === o.params.length));
    if (!m) throw new Error(`No ${name} with ${args.length} arguments`);
    if (hasLambda(m.body)) throw new Error(`Method ${name} is an image operation this script doesn't know`);
    const scope = new Map();
    m.params.forEach((p, i) => scope.set(p, m.varargs && i === m.params.length - 1 ? args.slice(i) : args[i]));
    // statements: `final Type name = expr;` and `return expr;`
    let stmt = [];
    for (let i = 0; i < m.body.length; i++) {
      const t = m.body[i];
      if (['(', '{', '['].includes(t.v)) {
        const end = closing(m.body, i);
        stmt.push(...m.body.slice(i, end));
        i = end - 1;
        continue;
      }
      if (t.v !== ';') {
        stmt.push(t);
        continue;
      }
      if (stmt[0].v === 'return') return expression(stmt.slice(1), scope);
      const eq = stmt.findIndex((s) => s.v === '=');
      if (eq < 1) throw new Error(`Can't read a statement in ${name}`);
      scope.set(stmt[eq - 1].v, expression(stmt.slice(eq + 1), scope));
      stmt = [];
    }
    throw new Error(`${name} returns nothing`);
  }

  function construct(cls, a) {
    switch (cls) {
      case 'Box':
        return box(...a);
      case 'InputFile':
        return { kind: 'input', path: a[0], outputs: [] };
      case 'SimpleOutputFile':
        return { kind: 'out', path: a[0], box: a[1], ops: [] };
      case 'MultipartOutputFile':
        return { kind: 'out', path: a[0], size: [a[1], a[2]], parts: a.slice(3), ops: [] };
      case 'TransformedBox':
        return { kind: 'part', box: a[0], ops: a[1], at: [a[2], a[3]] };
    }
    throw new Error(`Unknown class ${cls}`);
  }

  function member(obj, name, a) {
    if (obj?.kind === 'input' && name === 'outputs') return { ...obj, outputs: [...obj.outputs, ...a.flat()] };
    if (obj?.kind === 'out' && name === 'apply') return { ...obj, ops: [...obj.ops, a[0]] };
    if (obj?.kind === 'out' && name === 'metadata') return { ...obj, meta: a[0] };
    if (obj?.kind === 'box' && ['x', 'y', 'w', 'h'].includes(name)) return obj[name];
    if (obj?.kind === 'box' && (name === 'totalW' || name === 'totalH')) return obj[name === 'totalW' ? 'tw' : 'th'];
    throw new Error(`Unknown member .${name}`);
  }

  function expression(toks, scope) {
    let i = 0;
    const peek = () => toks[i];
    const eat = (v) => {
      if (toks[i]?.v !== v) throw new Error(`Expected ${v}, found ${toks[i]?.v}`);
      i++;
    };
    const args = () => {
      eat('(');
      const out = [];
      while (peek().v !== ')') {
        out.push(sum());
        if (peek().v === ',') i++;
      }
      eat(')');
      return out;
    };
    const primary = () => {
      const t = toks[i++];
      let v;
      if (t.t === 'num' || t.t === 'str') v = t.v;
      else if (t.v === '(') {
        v = sum();
        eat(')');
      } else if (t.v === 'new') {
        const cls = toks[i++].v;
        v = construct(cls, args());
      } else if (t.t === 'id' && peek()?.v === '::') {
        i++;
        v = op(toks[i++].v);
      } else if (t.v === 'List' && peek()?.v === '.' && toks[i + 1]?.v === 'of') {
        i += 2;
        v = args();
      } else if (t.v === 'Math' && peek()?.v === '.') {
        const fn = toks[i + 1].v;
        i += 2;
        v = Math[fn](...args());
      } else if (t.t === 'id' && peek()?.v === '(') v = call(t.v, args());
      else if (t.t === 'id') v = scope.has(t.v) ? scope.get(t.v) : field(t.v);
      else throw new Error(`Unexpected ${t.v}`);
      while (peek()?.v === '.') {
        const name = toks[i + 1].v;
        i += 2;
        v = member(v, name, peek()?.v === '(' ? args() : []);
      }
      return v;
    };
    const product = () => {
      let v = primary();
      while (['*', '/', '%'].includes(peek()?.v)) {
        const o = toks[i++].v;
        const r = primary();
        v = o === '*' ? v * r : o === '/' ? Math.trunc(v / r) : v % r;
      }
      return v;
    };
    const sum = () => {
      let v = product();
      while (['+', '-'].includes(peek()?.v)) {
        const o = toks[i++].v;
        const r = product();
        v = o === '+' ? (typeof v === 'string' || typeof r === 'string' ? `${v}${r}` : v + r) : v - r;
      }
      return v;
    };
    const v = sum();
    if (i !== toks.length) throw new Error(`Unread Java after the expression: ${toks.slice(i, i + 5).map((t) => t.v).join(' ')}`);
    return v;
  }

  return () => field('INPUTS');
}

/* output --------------------------------------------------------------------------------------- */

const prefix = (p) => (p.startsWith('assets/') ? p : `assets/${p}`); // newer slicers name files from assets/
const boxJson = (b) => [b.x, b.y, b.w, b.h, b.tw, b.th];
const opsJson = (ops) => ops.map((o) => o.v);
function outputJson(o) {
  const out = { path: prefix(o.path) };
  if (o.box) out.box = boxJson(o.box);
  if (o.size) {
    out.size = o.size;
    out.parts = o.parts.map((p) => ({ box: boxJson(p.box), ops: opsJson(p.ops), at: p.at }));
  }
  out.ops = opsJson(o.ops);
  if (o.meta !== undefined) out.meta = JSON.parse(o.meta); // also proves it is valid JSON
  return out;
}

const stages = {};
for (const stage of STAGES) {
  const res = await fetch(raw(`${stage}/src/main/java/com/mojang/slicer/Main.java`));
  if (!res.ok) throw new Error(`HTTP ${res.status} for slicer ${stage}`);
  const inputs = interpreter(await res.text())();
  stages[stage] = inputs.map((i) => ({ input: prefix(i.path), outputs: i.outputs.map(outputJson) }));
  console.log(`${stage}: ${stages[stage].length} inputs, ${stages[stage].reduce((n, i) => n + i.outputs.length, 0)} outputs`);
}

const file = { source: `https://github.com/Mojang/slicer/tree/${COMMIT}`, license: 'MIT, Copyright (c) Microsoft Corporation', stages };
writeFileSync('src/pack/upgrade/slices.json', `${JSON.stringify(file)}\n`);
console.log('Wrote src/pack/upgrade/slices.json');
