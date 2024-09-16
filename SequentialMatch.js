class Match {
  constructor(a, b, size) {
    this.a = a;
    this.b = b;
    this.size = size;
  }
}

function calculateRatio(matches, length) {
  if (length) {
    return (2.0 * matches) / length;
  }
  return 1.0;
}

class SequenceMatcher {
  constructor(isjunk = null, a = "", b = "", autojunk = true) {
    this.isjunk = isjunk;
    this.a = this.b = null;
    this.autojunk = autojunk;
    this.setSeqs(a, b);
  }

  setSeqs(a, b) {
    this.setSeq1(a);
    this.setSeq2(b);
  }

  setSeq1(a) {
    if (a === this.a) return;
    this.a = a;
    this.matchingBlocks = this.opcodes = null;
  }

  setSeq2(b) {
    if (b === this.b) return;
    this.b = b;
    this.matchingBlocks = this.opcodes = null;
    this.fullbcount = null;
    this.__chainB();
  }

  __chainB() {
    const b = this.b;
    this.b2j = {};
    for (let i = 0; i < b.length; i++) {
      const elt = b[i];
      if (!this.b2j[elt]) {
        this.b2j[elt] = [];
      }
      this.b2j[elt].push(i);
    }

    this.bjunk = new Set();
    if (this.isjunk) {
      for (const elt in this.b2j) {
        if (this.isjunk(elt)) {
          this.bjunk.add(elt);
        }
      }
      for (const elt of this.bjunk) {
        delete this.b2j[elt];
      }
    }

    this.bpopular = new Set();
    const n = b.length;
    if (this.autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const elt in this.b2j) {
        if (this.b2j[elt].length > ntest) {
          this.bpopular.add(elt);
        }
      }
      for (const elt of this.bpopular) {
        delete this.b2j[elt];
      }
    }
  }

  findLongestMatch(alo = 0, ahi = null, blo = 0, bhi = null) {
    if (ahi === null) ahi = this.a.length;
    if (bhi === null) bhi = this.b.length;

    let besti = alo;
    let bestj = blo;
    let bestsize = 0;

    const a = this.a;
    const b = this.b;
    const b2j = this.b2j;
    const isbjunk = this.bjunk.has.bind(this.bjunk);

    const j2len = {};
    const nothing = [];
    for (let i = alo; i < ahi; i++) {
      const newj2len = {};
      for (const j of b2j[a[i]] || nothing) {
        if (j < blo || j >= bhi) continue;
        const k = (newj2len[j] = (j2len[j - 1] || 0) + 1);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      Object.assign(j2len, newj2len);
    }

    while (besti > alo && bestj > blo && !isbjunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && !isbjunk(b[bestj + bestsize]) && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    while (besti > alo && bestj > blo && isbjunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && isbjunk(b[bestj + bestsize]) && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }

    return new Match(besti, bestj, bestsize);
  }

  getMatchingBlocks() {
    if (this.matchingBlocks !== null) {
      return this.matchingBlocks;
    }
    const la = this.a.length;
    const lb = this.b.length;
    const queue = [[0, la, 0, lb]];
    const matchingBlocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const x = this.findLongestMatch(alo, ahi, blo, bhi);
      const [i, j, k] = [x.a, x.b, x.size];
      if (k) {
        matchingBlocks.push(x);
        if (alo < i && blo < j) {
          queue.push([alo, i, blo, j]);
        }
        if (i + k < ahi && j + k < bhi) {
          queue.push([i + k, ahi, j + k, bhi]);
        }
      }
    }
    matchingBlocks.sort((x, y) => x.a - y.a || x.b - y.b);
    matchingBlocks.push(new Match(la, lb, 0));
    return matchingBlocks;
  }

  getOpcodes() {
    const opcodes = [];
    let i = 0,
      j = 0;
    for (const block of this.getMatchingBlocks()) {
      const { a: ai, b: bj, size } = block;
      let tag = "";
      if (i < ai && j < bj) {
        tag = "replace";
      } else if (i < ai) {
        tag = "delete";
      } else if (j < bj) {
        tag = " insert";
      }

      if (tag != "") {
        opcodes.push([tag, i, ai, j, bj]);
      }
      i = ai + size;
      j = bj + size;
      if (size) {
        opcodes.push(["equal", ai, i, bj, j]);
      }
    }

    return opcodes;
  }

  ratio() {
    const matches = this.getMatchingBlocks().reduce((sum, block) => sum + block.size, 0);
    const length = this.a.length + this.b.length;
    return calculateRatio(matches * 2, length);
  }
}

function convertDiffOps(matcher, a_tokens, b_tokens) {
  const diffResult = [];

  // Get the opcodes from the matcher
  const opcodes = matcher.getOpcodes();

  for (const [tag, i1, i2, j1, j2] of opcodes) {
    if (tag === "equal") {
      diffResult.push(...b_tokens.slice(j1, j2).map((token) => ({ operation: "unchanged", value: token })));
    } else if (tag === "replace") {
      diffResult.push(...a_tokens.slice(i1, i2).map((token) => ({ operation: "remove", value: token })));
      diffResult.push(...b_tokens.slice(j1, j2).map((token) => ({ operation: "add", value: token })));
    } else if (tag === "delete") {
      diffResult.push(...a_tokens.slice(i1, i2).map((token) => ({ operation: "remove", value: token })));
    } else if (tag === "insert") {
      diffResult.push(...b_tokens.slice(j1, j2).map((token) => ({ operation: "add", value: token })));
    }
  }

  return diffResult;
}

function tokenize(text) {
  return text.match(/\S+|\s+|\n/g);
}

function wordDiff(oldText, newText, caseSensitive = false) {
    let a = oldText;
    let b = newText;
    if(caseSensitive) {
        a = oldText.toLowerCase();
        b = newText.toLowerCase();
    }

    let a_token = tokenize(a);
    let b_token = tokenize(b);
    let original_case_token_a = tokenize(oldText);
    let original_case_token_b = tokenize(newText);
    let matcher = new SequenceMatcher(null, a_token, b_token);
    return convertDiffOps(matcher, original_case_token_a, original_case_token_b)
}
