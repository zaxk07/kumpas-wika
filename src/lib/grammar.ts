import { isLetter } from './signs'
import type { SignId } from './types'

/**
 * Gloss -> natural sentence engine.
 *
 * Sign languages don't follow spoken-language word order, and they drop words
 * spoken Filipino/English need (articles, linkers, enclitic pronouns, copulas).
 * This module turns a buffer of recognized glosses into grammatical Filipino and
 * English with a small rule-based grammar:
 *
 *   1. Consecutive fingerspelled letters merge into one word (Z-A-K-I -> ZAKI).
 *   2. The buffer is split into segments: interjections (KUMUSTA, SALAMAT, OO…)
 *      and clauses (pronoun + modal + object, questions, identity, …).
 *   3. Each clause is realized with Filipino grammar (enclitics "ko/mo",
 *      linker "ng", "-ng" + infinitive, "ba" for yes/no questions) and English
 *      grammar (subject–verb agreement, do-support, articles).
 *   4. Segments are joined with natural punctuation; PAKIUSAP becomes
 *      "Pakiusap, …" / "Please …".
 */

export type Token = { kind: 'sign'; id: SignId; keys: number[] } | { kind: 'word'; text: string; letters: SignId[]; keys: number[] }

export interface Sentence {
  fil: string
  en: string
  /** Name of the grammar rules that fired (shown in the UI as a hint of what happened). */
  rules: string[]
}

/** Merge runs of fingerspelled letters into word tokens. */
export function groupGlosses(entries: { id: SignId; key: number }[]): Token[] {
  const out: Token[] = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (isLetter(e.id)) {
      if (last?.kind === 'word') {
        last.text += e.id
        last.letters.push(e.id)
        last.keys.push(e.key)
      } else out.push({ kind: 'word', text: e.id, letters: [e.id], keys: [e.key] })
    } else out.push({ kind: 'sign', id: e.id, keys: [e.key] })
  }
  return out
}

// ---- helpers ---------------------------------------------------------------

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const titleName = (w: string) => (w.length <= 1 ? w : w[0] + w.slice(1).toLowerCase())

/** Canonicalize standard-specific variants to one lemma. */
function lemma(id: SignId): SignId {
  if (id === 'NO_SNAP') return 'HINDI'
  if (id === 'HELLO_SALUTE') return 'KUMUSTA'
  return id
}

type Lemma = SignId | 'NAME'
interface Tok {
  l: Lemma
  name?: string
}

interface Out {
  fil: string // without final punctuation
  en: string
  punct: '.' | '!' | '?'
  /** Filipino/English text starts with a proper noun or "I" — never lowercase it when joining. */
  keepCase?: { fil?: boolean; en?: boolean }
  imperative?: boolean
  rule: string
}

const NOUN: Partial<Record<Lemma, { fil: string; en: string }>> = {
  TUBIG: { fil: 'tubig', en: 'water' },
  KAIN: { fil: 'pagkain', en: 'food' },
  TULONG: { fil: 'tulong', en: 'help' },
}

const INTERJECTION: Partial<Record<Lemma, Out>> = {
  KUMUSTA: { fil: 'Kumusta', en: 'Hello', punct: '!', rule: 'greeting' },
  PAALAM: { fil: 'Paalam', en: 'Goodbye', punct: '!', rule: 'farewell' },
  SALAMAT: { fil: 'Salamat', en: 'Thank you', punct: '!', rule: 'thanks' },
  WALANG_ANUMAN: { fil: 'Walang anuman', en: "You're welcome", punct: '.', rule: 'courtesy' },
  PATAWAD: { fil: 'Patawad', en: "I'm sorry", punct: '.', rule: 'apology' },
  OO: { fil: 'Oo', en: 'Yes', punct: '.', rule: 'yes' },
  HINDI: { fil: 'Hindi', en: 'No', punct: '.', rule: 'no' },
  MAHAL_KITA: { fil: 'Mahal kita', en: 'I love you', punct: '.', rule: 'affection' },
  MAGALING: { fil: 'Magaling', en: 'Great job', punct: '!', rule: 'praise' },
  MALI: { fil: 'Mali', en: "That's wrong", punct: '.', rule: 'correction' },
  PAKIUSAP: { fil: 'Pakiusap', en: 'Please', punct: '.', rule: 'please' },
}

interface Subject {
  l: 'AKO' | 'IKAW' | 'NAME'
  name?: string
}
const enSubj = (s: Subject) => (s.l === 'AKO' ? 'I' : s.l === 'IKAW' ? 'you' : s.name!)
const filEnclitic = (s: Subject) => (s.l === 'AKO' ? 'ko' : s.l === 'IKAW' ? 'mo' : `ni ${s.name}`)
const enVerb = (s: Subject, base: string) => (s.l === 'NAME' ? `${base}s` : base)

/** Realize one clause (no interjections inside). */
function realizeClause(toks: Tok[]): Out | null {
  if (!toks.length) return null
  const has = (l: Lemma) => toks.some((t) => t.l === l)
  const nameTok = toks.find((t) => t.l === 'NAME')
  const name = nameTok?.name
  const pronouns = toks.filter((t) => t.l === 'AKO' || t.l === 'IKAW').map((t) => t.l as 'AKO' | 'IKAW')
  const modal = toks.find((t) => t.l === 'GUSTO' || t.l === 'KAILANGAN')?.l as 'GUSTO' | 'KAILANGAN' | undefined
  const objLemma = toks.find((t) => t.l === 'TUBIG' || t.l === 'KAIN' || t.l === 'TULONG')?.l
  const neg = has('HINDI')

  // ---- Questions -----------------------------------------------------------
  if (has('SAAN')) {
    if (objLemma && NOUN[objLemma]) {
      const n = NOUN[objLemma]!
      return { fil: `Nasaan ang ${n.fil}`, en: `Where is the ${n.en}`, punct: '?', rule: 'where-is' }
    }
    if (pronouns[0] === 'IKAW') return { fil: 'Nasaan ka', en: 'Where are you', punct: '?', rule: 'where-are-you' }
    if (pronouns[0] === 'AKO') return { fil: 'Nasaan ako', en: 'Where am I', punct: '?', rule: 'where-am-i' }
    if (name) return { fil: `Nasaan si ${name}`, en: `Where is ${name}`, punct: '?', rule: 'where-is-name' }
    return { fil: 'Saan', en: 'Where', punct: '?', rule: 'where' }
  }
  if (has('ANO')) {
    if (modal) {
      const subj: Subject = pronouns.includes('AKO') && !pronouns.includes('IKAW') ? { l: 'AKO' } : { l: 'IKAW' }
      const verbEn = modal === 'GUSTO' ? 'want' : 'need'
      return {
        fil: `Ano ang ${modal === 'GUSTO' ? 'gusto' : 'kailangan'} ${filEnclitic(subj)}`,
        en: `What do ${enSubj(subj)} ${verbEn}`,
        punct: '?',
        rule: 'what-do-you-want',
      }
    }
    if (objLemma && NOUN[objLemma]) return { fil: `Anong ${NOUN[objLemma]!.fil}`, en: `What ${NOUN[objLemma]!.en}`, punct: '?', rule: 'what-noun' }
    if (pronouns.includes('IKAW') && name) return { fil: `Ano ang pangalan mo`, en: 'What is your name', punct: '?', rule: 'what-name' }
    return { fil: 'Ano', en: 'What', punct: '?', rule: 'what' }
  }

  // ---- Modal clauses: (subject) GUSTO/KAILANGAN (object) --------------------
  if (modal) {
    const subj: Subject = name && !pronouns.length ? { l: 'NAME', name } : { l: pronouns[0] ?? 'AKO' }
    const question = subj.l === 'IKAW' && !neg
    const isWant = modal === 'GUSTO'
    const enBase = isWant ? 'want' : 'need'
    const filModal = isWant ? 'Gusto' : 'Kailangan'
    const S = enSubj(subj)
    const keepEn = subj.l !== 'IKAW'

    if (objLemma === 'KAIN') {
      // Infinitive: "Gusto kong kumain." / "I want to eat."
      if (neg) {
        const fil = isWant ? `Ayaw ${filEnclitic(subj)}ng kumain` : `Hindi ${filEnclitic(subj)} kailangang kumain`
        const en = `${cap(S)} ${subj.l === 'NAME' ? "doesn't" : "don't"} ${enBase} to eat`
        return { fil, en, punct: '.', keepCase: { en: keepEn }, rule: 'neg-modal-infinitive' }
      }
      if (question) return { fil: `${filModal} mo bang kumain`, en: `Do you ${enBase} to eat`, punct: '?', rule: 'modal-infinitive-question' }
      const encl = filEnclitic(subj)
      const fil = subj.l === 'NAME' ? `${filModal} ${encl} na kumain` : `${filModal} ${encl}ng kumain`
      return { fil, en: `${cap(S)} ${enVerb(subj, enBase)} to eat`, punct: '.', keepCase: { en: keepEn }, rule: 'modal-infinitive' }
    }

    const noun = objLemma ? NOUN[objLemma] : undefined
    if (noun) {
      if (neg) {
        const fil = isWant ? `Ayaw ${filEnclitic(subj)} ng ${noun.fil}` : `Hindi ${filEnclitic(subj)} kailangan ng ${noun.fil}`
        const en = `${cap(S)} ${subj.l === 'NAME' ? "doesn't" : "don't"} ${enBase} ${noun.en}`
        return { fil, en, punct: '.', keepCase: { en: keepEn }, rule: 'neg-modal-object' }
      }
      if (question) return { fil: `${filModal} mo ba ng ${noun.fil}`, en: `Do you ${enBase} ${noun.en}`, punct: '?', rule: 'modal-object-question' }
      return {
        fil: `${filModal} ${filEnclitic(subj)} ng ${noun.fil}`,
        en: `${cap(S)} ${enVerb(subj, enBase)} ${noun.en}`,
        punct: '.',
        keepCase: { en: keepEn },
        rule: 'modal-object',
      }
    }

    // No object: "Gusto ko." / "I want it."
    if (neg) return { fil: isWant ? `Ayaw ${filEnclitic(subj)}` : `Hindi ${filEnclitic(subj)} kailangan`, en: `${cap(S)} ${subj.l === 'NAME' ? "doesn't" : "don't"} ${enBase} it`, punct: '.', keepCase: { en: keepEn }, rule: 'neg-modal' }
    if (question) return { fil: `${filModal} mo ba`, en: `Do you ${enBase} it`, punct: '?', rule: 'modal-question' }
    return { fil: `${filModal} ${filEnclitic(subj)}`, en: `${cap(S)} ${enVerb(subj, enBase)} it`, punct: '.', keepCase: { en: keepEn }, rule: 'modal' }
  }

  // ---- Predicates ----------------------------------------------------------
  if (has('MAHAL_KITA')) {
    if (name) return { fil: `Mahal kita, ${name}`, en: `I love you, ${name}`, punct: '.', keepCase: { en: true }, rule: 'affection-vocative' }
    return { fil: 'Mahal kita', en: 'I love you', punct: '.', keepCase: { en: true }, rule: 'affection' }
  }
  if (has('MAGALING') || has('MALI')) {
    const good = has('MAGALING')
    const adjFil = good ? 'Magaling' : 'Mali'
    if (pronouns[0] === 'IKAW') return { fil: `${adjFil} ka`, en: good ? "You're great" : "You're wrong", punct: good ? '!' : '.', rule: 'predicate-adj' }
    if (pronouns[0] === 'AKO') return { fil: `${adjFil} ako`, en: good ? "I'm great" : 'I was wrong', punct: good ? '!' : '.', keepCase: { en: true }, rule: 'predicate-adj' }
    if (name) return { fil: `${adjFil} si ${name}`, en: good ? `${name} is great` : `${name} is wrong`, punct: good ? '!' : '.', keepCase: { en: true }, rule: 'predicate-adj' }
    return { ...INTERJECTION[good ? 'MAGALING' : 'MALI']! }
  }

  if (objLemma === 'TULONG') {
    if (pronouns.includes('AKO') || pronouns.includes('IKAW'))
      return { fil: 'Tulungan mo ako', en: 'Help me', punct: '.', imperative: true, rule: 'imperative-help' }
    return { fil: 'Tulong', en: 'Help', punct: '!', imperative: true, rule: 'exclamation' }
  }
  if (objLemma === 'KAIN') {
    if (pronouns[0] === 'IKAW') return { fil: 'Kumain ka na ba', en: 'Have you eaten', punct: '?', rule: 'greeting-eaten' }
    if (pronouns[0] === 'AKO') return { fil: 'Kakain ako', en: "I'm going to eat", punct: '.', keepCase: { en: true }, rule: 'future' }
    return { fil: 'Kain tayo', en: "Let's eat", punct: '!', rule: 'invitation' }
  }
  if (objLemma === 'TUBIG') {
    // Subject + noun with no verb: assume the most common intent ("want").
    if (pronouns[0] === 'AKO') return { fil: 'Gusto ko ng tubig', en: 'I want water', punct: '.', keepCase: { en: true }, rule: 'implied-want' }
    if (pronouns[0] === 'IKAW') return { fil: 'Gusto mo ba ng tubig', en: 'Do you want water', punct: '?', rule: 'implied-want-question' }
    return { fil: 'Tubig', en: 'Water', punct: '.', rule: 'noun' }
  }

  // ---- Identity: AKO + NAME -> "Ako si Zaki." --------------------------------
  if (name) {
    if (pronouns[0] === 'AKO') return { fil: `Ako si ${name}`, en: `I'm ${name}`, punct: '.', keepCase: { en: true }, rule: 'introduction' }
    if (pronouns[0] === 'IKAW') return { fil: `Ikaw ba si ${name}`, en: `Are you ${name}`, punct: '?', rule: 'identity-question' }
    return { fil: name, en: name, punct: '.', keepCase: { fil: true, en: true }, rule: 'fingerspelled' }
  }
  if (pronouns.length === 1 && toks.length === 1) {
    return pronouns[0] === 'AKO' ? { fil: 'Ako', en: 'Me', punct: '.', rule: 'pronoun' } : { fil: 'Ikaw', en: 'You', punct: '.', rule: 'pronoun' }
  }
  if (pronouns.length === 2) return { fil: 'Ikaw at ako', en: 'You and me', punct: '.', rule: 'pronoun-pair' }
  return null
}

/** Signs that can head a clause (everything else is an interjection). */
const CLAUSE_LEMMAS = new Set<Lemma>(['AKO', 'IKAW', 'GUSTO', 'KAILANGAN', 'SAAN', 'ANO', 'TUBIG', 'KAIN', 'TULONG', 'NAME', 'MAGALING', 'MALI', 'MAHAL_KITA'])

function joinSegments(parts: Out[], rules: string[]): Sentence {
  const fil: string[] = []
  const en: string[] = []
  let please = false
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    rules.push(p.rule)
    if (p.rule === 'please' && i < parts.length - 1) {
      please = true
      continue
    }
    let f = p.fil
    let e = p.en
    if (please) {
      f = `Pakiusap, ${p.keepCase?.fil ? f : f[0].toLowerCase() + f.slice(1)}`
      e = p.imperative ? `Please ${p.keepCase?.en ? e : e[0].toLowerCase() + e.slice(1)}` : `${e}, please`
      please = false
    }
    const next = parts[i + 1]
    // Short responses lead into the next clause with a comma: "Oo, gusto ko ng tubig."
    const lead = (p.rule === 'yes' || p.rule === 'no') && next && next.rule !== 'please'
    if (lead) {
      const lower = (s: string, keep?: boolean) => (keep ? s : s[0].toLowerCase() + s.slice(1))
      parts[i + 1] = { ...next, fil: `${f}, ${lower(next.fil, next.keepCase?.fil)}`, en: `${e}, ${lower(next.en, next.keepCase?.en)}` }
      continue
    }
    fil.push(`${f}${p.punct}`)
    en.push(`${e}${p.punct}`)
  }
  return { fil: fil.join(' '), en: en.join(' '), rules }
}

/** Translate a gloss buffer into natural Filipino + English. */
export function glossToSentence(tokens: Token[]): Sentence {
  const toks: Tok[] = tokens.map((t) => (t.kind === 'word' ? { l: 'NAME', name: titleName(t.text) } : { l: lemma(t.id) }))
  if (!toks.length) return { fil: '', en: '', rules: [] }
  const parts: Out[] = []
  let i = 0
  while (i < toks.length) {
    const t = toks[i]
    const next = toks[i + 1]

    // Fixed expressions that combine with what follows.
    if (t.l === 'KUMUSTA' && next?.l === 'IKAW') {
      parts.push({ fil: 'Kumusta ka', en: 'How are you', punct: '?', rule: 'how-are-you' })
      i += 2
      continue
    }
    if (t.l === 'KUMUSTA' && next?.l === 'NAME') {
      parts.push({ fil: `Kumusta, ${next.name}`, en: `Hello, ${next.name}`, punct: '!', rule: 'greeting-name' })
      i += 2
      continue
    }
    if (t.l === 'SALAMAT' && next && (next.l === 'TULONG' || next.l === 'IKAW' || next.l === 'NAME')) {
      parts.push(
        next.l === 'TULONG'
          ? { fil: 'Salamat sa tulong', en: 'Thank you for the help', punct: '.', rule: 'thanks-for' }
          : next.l === 'IKAW'
            ? { fil: 'Salamat sa iyo', en: 'Thank you', punct: '!', rule: 'thanks-you' }
            : { fil: `Salamat, ${next.name}`, en: `Thank you, ${next.name}`, punct: '!', rule: 'thanks-name' },
      )
      i += 2
      continue
    }
    if (t.l === 'IKAW' && next?.l === 'KUMUSTA') {
      parts.push({ fil: 'Kumusta ka', en: 'How are you', punct: '?', rule: 'how-are-you' })
      i += 2
      continue
    }
    if (t.l === 'HINDI' && next && (next.l === 'GUSTO' || next.l === 'KAILANGAN' || CLAUSE_LEMMAS.has(next.l)) && toks.slice(i + 1).some((x) => x.l === 'GUSTO' || x.l === 'KAILANGAN')) {
      // Negation inside a clause: HINDI GUSTO TUBIG -> "Ayaw ko ng tubig."
      const clause: Tok[] = [t]
      let j = i + 1
      while (j < toks.length && CLAUSE_LEMMAS.has(toks[j].l)) clause.push(toks[j++])
      const out = realizeClause(clause)
      if (out) parts.push(out)
      i = j
      continue
    }

    if (CLAUSE_LEMMAS.has(t.l)) {
      const clause: Tok[] = []
      let j = i
      // Absorb a negation that appears mid-clause (AKO HINDI GUSTO …).
      while (j < toks.length && (CLAUSE_LEMMAS.has(toks[j].l) || (toks[j].l === 'HINDI' && toks.slice(j + 1).some((x) => x.l === 'GUSTO' || x.l === 'KAILANGAN')))) {
        clause.push(toks[j++])
      }
      const out = realizeClause(clause)
      if (out) parts.push(out)
      else {
        // Unknown combination -> readable gloss fallback.
        const words = clause.map((c) => (c.l === 'NAME' ? c.name! : c.l.replace('_', ' ').toLowerCase()))
        parts.push({ fil: cap(words.join(' ')), en: cap(words.join(' ')), punct: '.', rule: 'gloss-fallback' })
      }
      i = j
      continue
    }

    const inter = INTERJECTION[t.l]
    if (inter) parts.push({ ...inter })
    i++
  }
  return joinSegments(parts, [])
}

/** Live preview while the phrase is still open: same sentence, no final punctuation. */
export function previewSentence(tokens: Token[]): Sentence {
  const s = glossToSentence(tokens)
  const strip = (x: string) => x.replace(/[.!?]$/, '')
  return { ...s, fil: strip(s.fil), en: strip(s.en) }
}
